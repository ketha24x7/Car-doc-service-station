/*
 * support.js — minimal runtime for the "Design Component" (.dc.html) prototype format.
 * Implements: <x-dc> root, <helmet> style injection, <sc-if>, <sc-for>, <dc-import>,
 * {{ expr }} interpolation, and the DCLogic base class (state/props/setState/renderVals).
 * This exists purely to render the click-through prototype in a real browser for client
 * review — it is not meant to be reused in the production implementation.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------- expression evaluation ----------
  var exprCache = Object.create(null);
  function compileExpr(expr) {
    var fn = exprCache[expr];
    if (!fn) {
      fn = new Function('$scope', 'with ($scope || {}) { return (' + expr + '); }');
      exprCache[expr] = fn;
    }
    return fn;
  }
  function evalExpr(expr, scope) {
    try {
      return compileExpr(expr)(scope);
    } catch (err) {
      console.error('[dc] expression error:', expr, err);
      return undefined;
    }
  }

  var FULL_EXPR_RE = /^\s*\{\{\s*([\s\S]+?)\s*\}\}\s*$/;
  var PART_EXPR_RE = /\{\{\s*([\s\S]+?)\s*\}\}/g;

  function interpolateString(str, scope) {
    if (str == null || str.indexOf('{{') === -1) return str;
    return str.replace(PART_EXPR_RE, function (_, expr) {
      var v = evalExpr(expr, scope);
      return v == null ? '' : String(v);
    });
  }
  function evalRaw(str, scope) {
    if (str == null) return str;
    var m = str.match(FULL_EXPR_RE);
    if (m) return evalExpr(m[1], scope);
    return interpolateString(str, scope);
  }
  function kebabToCamel(s) {
    return s.replace(/-([a-z0-9])/g, function (_, c) { return c.toUpperCase(); });
  }

  // ---------- helmet (styles/fonts) injection, once per template node ----------
  var injectedHelmets = new WeakSet();
  function injectHelmet(node) {
    if (injectedHelmets.has(node)) return;
    injectedHelmets.add(node);
    document.head.insertAdjacentHTML('beforeend', node.innerHTML);
  }

  // ---------- rendering ----------
  function renderNodeList(nodes, scope, ctx) {
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var r = renderNode(nodes[i], scope, ctx);
      for (var j = 0; j < r.length; j++) out.push(r[j]);
    }
    return out;
  }

  function renderNode(node, scope, ctx) {
    if (node.nodeType === 3) { // text
      return [document.createTextNode(interpolateString(node.textContent, scope))];
    }
    if (node.nodeType !== 1) return []; // comments etc.

    var tag = node.tagName.toLowerCase();

    if (tag === 'helmet') {
      injectHelmet(node);
      return [];
    }

    if (tag === 'sc-if') {
      var cond = evalRaw(node.getAttribute('value') || 'false', scope);
      if (!cond) return [];
      return renderNodeList(Array.prototype.slice.call(node.childNodes), scope, ctx);
    }

    if (tag === 'sc-for') {
      var list = evalRaw(node.getAttribute('list') || '[]', scope) || [];
      var asName = node.getAttribute('as') || 'item';
      var kids = Array.prototype.slice.call(node.childNodes);
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var childScope = Object.create(scope);
        childScope[asName] = list[i];
        childScope[asName + 'Index'] = i;
        var rendered = renderNodeList(kids, childScope, ctx);
        for (var j = 0; j < rendered.length; j++) out.push(rendered[j]);
      }
      return out;
    }

    if (tag === 'dc-import') {
      var name = node.getAttribute('name');
      var props = {};
      var attrs = node.attributes;
      for (var a = 0; a < attrs.length; a++) {
        var attrName = attrs[a].name;
        if (attrName === 'name' || attrName.indexOf('hint-') === 0) continue;
        props[kebabToCamel(attrName)] = evalRaw(attrs[a].value, scope);
      }
      return [ctx.getChildContainer(name, props)];
    }

    // regular element
    var el = (node.namespaceURI === SVG_NS)
      ? document.createElementNS(SVG_NS, node.tagName)
      : document.createElement(tag);

    var hasDcValue = false, dcValue;
    var handlers = {};
    var nattrs = node.attributes;
    for (var k = 0; k < nattrs.length; k++) {
      var an = nattrs[k].name, av = nattrs[k].value;
      if (an.indexOf('hint-') === 0) continue;
      if (an === 'value') { dcValue = evalRaw(av, scope); hasDcValue = true; continue; }
      if (an === 'defaultvalue') { el.value = evalRaw(av, scope); continue; }
      var evtMatch = /^on([a-z]+)$/.exec(an);
      if (evtMatch) {
        var fn = evalRaw(av, scope);
        if (typeof fn === 'function') handlers[evtMatch[1]] = fn;
        continue;
      }
      el.setAttribute(an, interpolateString(av, scope));
    }
    if (hasDcValue) {
      el._dcValue = dcValue;
      el.value = dcValue == null ? '' : dcValue;
    }
    el._dcHandlers = handlers;
    for (var evt in handlers) {
      el.addEventListener(evt, handlers[evt]);
      if (evt === 'change' && (tag === 'input' || tag === 'textarea')) {
        el.addEventListener('input', handlers[evt]);
      }
    }

    var children = renderNodeList(Array.prototype.slice.call(node.childNodes), scope, ctx);
    for (var c = 0; c < children.length; c++) el.appendChild(children[c]);

    return [el];
  }

  // ---------- morphing (preserves focus/cursor across re-renders) ----------
  function removeHandlers(el, handlers) {
    for (var evt in handlers) {
      el.removeEventListener(evt, handlers[evt]);
      if (evt === 'change' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        el.removeEventListener('input', handlers[evt]);
      }
    }
  }
  function addHandlers(el, handlers) {
    for (var evt in handlers) {
      el.addEventListener(evt, handlers[evt]);
      if (evt === 'change' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        el.addEventListener('input', handlers[evt]);
      }
    }
  }

  function morph(oldNode, newNode) {
    if (oldNode === newNode) return oldNode;
    if (oldNode.nodeType !== newNode.nodeType || oldNode.nodeName !== newNode.nodeName) {
      oldNode.replaceWith(newNode);
      return newNode;
    }
    if (oldNode.nodeType === 3) {
      if (oldNode.nodeValue !== newNode.nodeValue) oldNode.nodeValue = newNode.nodeValue;
      return oldNode;
    }
    if (oldNode.nodeType !== 1) return oldNode;

    var oldAttrs = Array.prototype.slice.call(oldNode.attributes);
    var newAttrs = Array.prototype.slice.call(newNode.attributes);
    var newNames = {};
    var i;
    for (i = 0; i < newAttrs.length; i++) newNames[newAttrs[i].name] = true;
    for (i = 0; i < oldAttrs.length; i++) {
      if (!newNames[oldAttrs[i].name]) oldNode.removeAttribute(oldAttrs[i].name);
    }
    for (i = 0; i < newAttrs.length; i++) {
      var n = newAttrs[i].name, v = newAttrs[i].value;
      if (oldNode.getAttribute(n) !== v) oldNode.setAttribute(n, v);
    }

    if (newNode._dcValue !== undefined) {
      if (oldNode.value !== String(newNode._dcValue == null ? '' : newNode._dcValue)) {
        oldNode.value = newNode._dcValue == null ? '' : newNode._dcValue;
      }
      oldNode._dcValue = newNode._dcValue;
    }

    var oldHandlers = oldNode._dcHandlers || {};
    var newHandlers = newNode._dcHandlers || {};
    removeHandlers(oldNode, oldHandlers);
    addHandlers(oldNode, newHandlers);
    oldNode._dcHandlers = newHandlers;

    morphChildren(oldNode, Array.prototype.slice.call(newNode.childNodes));
    return oldNode;
  }

  function morphChildren(parent, newChildren) {
    var oldChildren = Array.prototype.slice.call(parent.childNodes);
    var max = Math.max(oldChildren.length, newChildren.length);
    for (var i = 0; i < max; i++) {
      if (i >= newChildren.length) { parent.removeChild(oldChildren[i]); continue; }
      if (i >= oldChildren.length) { parent.appendChild(newChildren[i]); continue; }
      morph(oldChildren[i], newChildren[i]);
    }
  }

  // ---------- DCLogic base class ----------
  function DCLogic(props) {
    this.props = props || {};
    if (!this.state) this.state = {};
    this._mounted = false;
    this._pendingRender = false;
    this._childSlots = Object.create(null);
  }
  DCLogic.prototype.setState = function (patch) {
    var next = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = Object.assign({}, this.state, next);
    this.scheduleRender();
  };
  DCLogic.prototype.setProps = function (props) {
    this.props = props;
    this.scheduleRender();
  };
  DCLogic.prototype.scheduleRender = function () {
    if (this._pendingRender) return;
    this._pendingRender = true;
    var self = this;
    Promise.resolve().then(function () {
      self._pendingRender = false;
      self.performRender();
    });
  };
  DCLogic.prototype.getChildContainer = function (name, props) {
    var slot = this._childSlots[name];
    if (!slot) {
      slot = new ChildSlot(name);
      this._childSlots[name] = slot;
    }
    slot.updateProps(props);
    return slot.container;
  };
  DCLogic.prototype.performRender = function () {
    var vals = this.renderVals ? this.renderVals() : {};
    var ctx = { getChildContainer: this.getChildContainer.bind(this) };
    var scope = Object.assign({}, vals);
    var newNodes = renderNodeList(this._template, scope, ctx);
    if (!this.container.firstChild) {
      var frag = document.createDocumentFragment();
      newNodes.forEach(function (n) { frag.appendChild(n); });
      this.container.appendChild(frag);
    } else {
      morphChildren(this.container, newNodes);
    }
    if (!this._mounted) {
      this._mounted = true;
      if (this.componentDidMount) this.componentDidMount();
    }
  };

  // ---------- component loading (root uses live DOM; imports are fetched) ----------
  var componentCache = Object.create(null); // name -> { ComponentClass, template }

  function buildComponent(scriptSrc, templateRoot) {
    var ComponentClass = new Function('DCLogic', scriptSrc + '\n;return Component;')(DCLogic);
    var template = Array.prototype.slice.call(templateRoot.childNodes);
    return { ComponentClass: ComponentClass, template: template };
  }

  function loadComponentByName(name) {
    if (componentCache[name]) return Promise.resolve(componentCache[name]);
    return fetch('./' + name + '.dc.html')
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load component ' + name + ': ' + res.status);
        return res.text();
      })
      .then(function (raw) {
        var scriptMatch = raw.match(/<script[^>]*type=["']text\/x-dc["'][^>]*>([\s\S]*?)<\/script>/i);
        if (!scriptMatch) throw new Error('No dc script found for ' + name);
        var xdcStart = raw.indexOf('<x-dc>');
        var xdcEnd = raw.indexOf('</x-dc>');
        if (xdcStart === -1 || xdcEnd === -1) throw new Error('No <x-dc> root found for ' + name);
        var xdcHtml = raw.slice(xdcStart + '<x-dc>'.length, xdcEnd);
        var doc = new DOMParser().parseFromString('<div id="__dc_root__">' + xdcHtml + '</div>', 'text/html');
        var rootEl = doc.getElementById('__dc_root__');
        var built = buildComponent(scriptMatch[1], rootEl);
        componentCache[name] = built;
        return built;
      });
  }

  function ChildSlot(name) {
    this.name = name;
    this.container = document.createElement('div');
    this.instance = null;
    this.pendingProps = {};
    var self = this;
    loadComponentByName(name).then(function (built) {
      var instance = new built.ComponentClass(self.pendingProps);
      instance._template = built.template;
      instance.container = self.container;
      self.instance = instance;
      instance.performRender();
    }).catch(function (err) {
      console.error(err);
      self.container.textContent = 'Failed to load ' + name;
    });
  }
  ChildSlot.prototype.updateProps = function (props) {
    this.pendingProps = props;
    if (this.instance) this.instance.setProps(props);
  };

  // ---------- bootstrap the root document ----------
  function bootstrapRoot() {
    var xdcEl = document.querySelector('x-dc');
    var scriptEl = document.querySelector('script[type="text/x-dc"]');
    if (!xdcEl || !scriptEl) {
      console.error('[dc] missing <x-dc> or dc script in root document');
      return;
    }
    var built = buildComponent(scriptEl.textContent, xdcEl);
    document.body.innerHTML = '';
    var container = document.createElement('div');
    container.id = 'dc-app-root';
    document.body.appendChild(container);
    var instance = new built.ComponentClass({});
    instance._template = built.template;
    instance.container = container;
    instance.performRender();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapRoot);
  } else {
    bootstrapRoot();
  }
})();
