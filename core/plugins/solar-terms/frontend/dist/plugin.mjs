// @__NO_SIDE_EFFECTS__
function zs(e) {
  const t = /* @__PURE__ */ Object.create(null);
  for (const s of e.split(",")) t[s] = 1;
  return (s) => s in t;
}
const z = {}, st = [], ke = () => {
}, Zn = () => !1, os = (e) => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && // uppercase letter
(e.charCodeAt(2) > 122 || e.charCodeAt(2) < 97), cs = (e) => e.startsWith("onUpdate:"), ne = Object.assign, Gs = (e, t) => {
  const s = e.indexOf(t);
  s > -1 && e.splice(s, 1);
}, oi = Object.prototype.hasOwnProperty, D = (e, t) => oi.call(e, t), I = Array.isArray, ze = (e) => Ft(e) === "[object Map]", Yt = (e) => Ft(e) === "[object Set]", vn = (e) => Ft(e) === "[object Date]", k = (e) => typeof e == "function", X = (e) => typeof e == "string", we = (e) => typeof e == "symbol", B = (e) => e !== null && typeof e == "object", Qn = (e) => (B(e) || k(e)) && k(e.then) && k(e.catch), er = Object.prototype.toString, Ft = (e) => er.call(e), ci = (e) => Ft(e).slice(8, -1), tr = (e) => Ft(e) === "[object Object]", Js = (e) => X(e) && e !== "NaN" && e[0] !== "-" && "" + parseInt(e, 10) === e, Tt = /* @__PURE__ */ zs(
  // the leading comma is intentional so empty string "" is also included
  ",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"
), fs = (e) => {
  const t = /* @__PURE__ */ Object.create(null);
  return ((s) => t[s] || (t[s] = e(s)));
}, fi = /-\w/g, ue = fs(
  (e) => e.replace(fi, (t) => t.slice(1).toUpperCase())
), ai = /\B([A-Z])/g, it = fs(
  (e) => e.replace(ai, "-$1").toLowerCase()
), as = fs((e) => e.charAt(0).toUpperCase() + e.slice(1)), xs = fs(
  (e) => e ? `on${as(e)}` : ""
), Re = (e, t) => !Object.is(e, t), vs = (e, ...t) => {
  for (let s = 0; s < e.length; s++)
    e[s](...t);
}, sr = (e, t, s, n = !1) => {
  Object.defineProperty(e, t, {
    configurable: !0,
    enumerable: !1,
    writable: n,
    value: s
  });
}, ui = (e) => {
  const t = parseFloat(e);
  return isNaN(t) ? e : t;
};
let wn;
const us = () => wn || (wn = typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : typeof global < "u" ? global : {});
function Ys(e) {
  if (I(e)) {
    const t = {};
    for (let s = 0; s < e.length; s++) {
      const n = e[s], r = X(n) ? pi(n) : Ys(n);
      if (r)
        for (const i in r)
          t[i] = r[i];
    }
    return t;
  } else if (X(e) || B(e))
    return e;
}
const di = /;(?![^(]*\))/g, hi = /:([^]+)/, gi = /"(?:[^"\\]|\\[^])*"|'(?:[^'\\]|\\[^])*'|\\[^]|\/\*[^]*?\*\//g;
function pi(e) {
  const t = {};
  return e.replace(gi, (s) => s.startsWith("/*") ? "" : s).split(di).forEach((s) => {
    if (s) {
      const n = s.split(hi);
      n.length > 1 && (t[n[0].trim()] = n[1].trim());
    }
  }), t;
}
function at(e) {
  let t = "";
  if (X(e))
    t = e;
  else if (I(e))
    for (let s = 0; s < e.length; s++) {
      const n = at(e[s]);
      n && (t += n + " ");
    }
  else if (B(e))
    for (const s in e)
      e[s] && (t += s + " ");
  return t.trim();
}
const mi = "itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,playsinline,readonly", bi = /* @__PURE__ */ zs(mi);
function nr(e) {
  return !!e || e === "";
}
function yi(e, t, s) {
  if (e.length !== t.length) return !1;
  let n = !0;
  for (let r = 0; n && r < e.length; r++)
    n = ds(e[r], t[r], s);
  return n;
}
function Sn(e, t, s) {
  if (e.size !== t.size) return !1;
  const n = Array.from(t), r = new Uint8Array(n.length);
  for (const i of e) {
    let l = -1;
    for (let o = 0; o < n.length; o++)
      if (!r[o] && ds(i, n[o], s)) {
        l = o;
        break;
      }
    if (l < 0) return !1;
    r[l] = 1;
  }
  return !0;
}
function _i(e, t, s) {
  let n = ze(e), r = ze(t);
  if (n || r || (n = Yt(e), r = Yt(t), n || r))
    return n && r ? Sn(e, t, s) : !1;
  const i = Object.keys(e).length, l = Object.keys(t).length;
  if (i !== l)
    return !1;
  for (const o in e) {
    const f = e.hasOwnProperty(o), d = t.hasOwnProperty(o);
    if (f && !d || !f && d || !ds(e[o], t[o], s))
      return !1;
  }
  return String(e) === String(t);
}
function Tn(e, t, s, n) {
  s || (s = [/* @__PURE__ */ new Map(), /* @__PURE__ */ new Map()]);
  const [r, i] = s;
  if (r.has(e) || i.has(t))
    return r.get(e) === t && i.get(t) === e;
  r.set(e, t), i.set(t, e);
  const l = n(e, t, s);
  return r.delete(e), i.delete(t), l;
}
function ds(e, t, s) {
  if (e === t) return !0;
  let n = vn(e), r = vn(t);
  return n || r ? n && r ? e.getTime() === t.getTime() : !1 : (n = we(e), r = we(t), n || r ? e === t : (n = I(e), r = I(t), n || r ? n && r ? Tn(e, t, s, yi) : !1 : (n = B(e), r = B(t), n || r ? !n || !r ? !1 : Tn(e, t, s, _i) : String(e) === String(t))));
}
const rr = (e) => !!(e && e.__v_isRef === !0), W = (e) => X(e) ? e : e == null ? "" : I(e) || B(e) && (e.toString === er || !k(e.toString)) ? rr(e) ? W(e.value) : JSON.stringify(e, ir, 2) : String(e), ir = (e, t) => rr(t) ? ir(e, t.value) : ze(t) ? {
  [`Map(${t.size})`]: [...t.entries()].reduce(
    (s, [n, r], i) => (s[ws(n, i) + " =>"] = r, s),
    {}
  )
} : Yt(t) ? {
  [`Set(${t.size})`]: [...t.values()].map((s) => ws(s))
} : we(t) ? ws(t) : B(t) && !I(t) && !tr(t) ? String(t) : t, ws = (e, t = "") => {
  var s;
  return (
    // Symbol.description in es2019+ so we need to cast here to pass
    // the lib: es2016 check
    we(e) ? `Symbol(${(s = e.description) != null ? s : t})` : e
  );
};
let te;
class xi {
  // TODO isolatedDeclarations "__v_skip"
  constructor(t = !1) {
    this.detached = t, this._active = !0, this._on = 0, this.effects = [], this.cleanups = [], this._isPaused = !1, this._warnOnRun = !0, this.__v_skip = !0, !t && te && (te.active ? (this.parent = te, this.index = (te.scopes || (te.scopes = [])).push(
      this
    ) - 1) : (this._active = !1, this._warnOnRun = !1));
  }
  get active() {
    return this._active;
  }
  pause() {
    if (this._active) {
      this._isPaused = !0;
      let t, s;
      if (this.scopes) {
        const n = this.scopes.slice();
        for (t = 0, s = n.length; t < s; t++)
          n[t].pause();
      }
      for (t = 0, s = this.effects.length; t < s; t++)
        this.effects[t].pause();
    }
  }
  /**
   * Resumes the effect scope, including all child scopes and effects.
   */
  resume() {
    if (this._active && this._isPaused) {
      this._isPaused = !1;
      let t, s;
      if (this.scopes) {
        const r = this.scopes.slice();
        for (t = 0, s = r.length; t < s; t++)
          r[t].resume();
      }
      const n = this.effects.slice();
      for (t = 0, s = n.length; t < s; t++)
        n[t].resume();
    }
  }
  run(t) {
    if (this._active) {
      const s = te;
      try {
        return te = this, t();
      } finally {
        te = s;
      }
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  on() {
    ++this._on === 1 && (this.prevScope = te, te = this);
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  off() {
    if (this._on > 0 && --this._on === 0) {
      if (te === this)
        te = this.prevScope;
      else {
        let t = te;
        for (; t; ) {
          if (t.prevScope === this) {
            t.prevScope = this.prevScope;
            break;
          }
          t = t.prevScope;
        }
      }
      this.prevScope = void 0;
    }
  }
  stop(t) {
    if (this._active) {
      this._active = !1;
      let s, n;
      for (s = 0, n = this.effects.length; s < n; s++)
        this.effects[s].stop();
      for (this.effects.length = 0, s = 0, n = this.cleanups.length; s < n; s++)
        this.cleanups[s]();
      if (this.cleanups.length = 0, this.scopes) {
        const r = this.scopes.slice();
        for (s = 0, n = r.length; s < n; s++)
          r[s].stop(!0);
        this.scopes.length = 0;
      }
      if (!this.detached && this.parent && !t) {
        const r = this.parent.scopes.pop();
        r && r !== this && (this.parent.scopes[this.index] = r, r.index = this.index);
      }
      this.parent = void 0;
    }
  }
}
function vi() {
  return te;
}
let q;
const Ss = /* @__PURE__ */ new WeakSet();
class lr {
  constructor(t) {
    this.fn = t, this.deps = void 0, this.depsTail = void 0, this.flags = 5, this.next = void 0, this.cleanup = void 0, this.scheduler = void 0, te && (te.active ? te.effects.push(this) : this.flags &= -2);
  }
  pause() {
    this.flags |= 64;
  }
  resume() {
    this.flags & 64 && (this.flags &= -65, Ss.has(this) && (Ss.delete(this), this.trigger()));
  }
  /**
   * @internal
   */
  notify() {
    this.flags & 2 && !(this.flags & 32) || this.flags & 8 || cr(this);
  }
  run() {
    if (!(this.flags & 1))
      return this.fn();
    this.flags |= 2, Cn(this), fr(this);
    const t = q, s = ve;
    q = this, ve = !0;
    try {
      return this.fn();
    } finally {
      ar(this), q = t, ve = s, this.flags &= -3;
    }
  }
  stop() {
    if (this.flags & 1) {
      for (let t = this.deps; t; t = t.nextDep)
        Qs(t);
      this.deps = this.depsTail = void 0, Cn(this), this.onStop && this.onStop(), this.flags &= -2;
    }
  }
  trigger() {
    this.flags & 64 ? Ss.add(this) : this.scheduler ? this.scheduler() : this.runIfDirty();
  }
  /**
   * @internal
   */
  runIfDirty() {
    $s(this) && this.run();
  }
  get dirty() {
    return $s(this);
  }
}
let or = 0, Ct, Et;
function cr(e, t = !1) {
  if (e.flags |= 8, t) {
    e.next = Et, Et = e;
    return;
  }
  e.next = Ct, Ct = e;
}
function Xs() {
  or++;
}
function Zs() {
  if (--or > 0)
    return;
  if (Et) {
    let t = Et;
    for (Et = void 0; t; ) {
      const s = t.next;
      t.next = void 0, t.flags &= -9, t = s;
    }
  }
  let e;
  for (; Ct; ) {
    let t = Ct;
    for (Ct = void 0; t; ) {
      const s = t.next;
      if (t.next = void 0, t.flags &= -9, t.flags & 1)
        try {
          t.trigger();
        } catch (n) {
          e || (e = n);
        }
      t = s;
    }
  }
  if (e) throw e;
}
function fr(e) {
  for (let t = e.deps; t; t = t.nextDep)
    t.version = -1, t.prevActiveLink = t.dep.activeLink, t.dep.activeLink = t;
}
function ar(e) {
  let t, s = e.depsTail, n = s;
  for (; n; ) {
    const r = n.prevDep;
    n.version === -1 ? (n === s && (s = r), Qs(n), wi(n)) : t = n, n.dep.activeLink = n.prevActiveLink, n.prevActiveLink = void 0, n = r;
  }
  e.deps = t, e.depsTail = s;
}
function $s(e) {
  for (let t = e.deps; t; t = t.nextDep)
    if (t.dep.version !== t.version || t.dep.computed && (ur(t.dep.computed) || t.dep.version !== t.version))
      return !0;
  return !!e._dirty;
}
function ur(e) {
  if (e.flags & 4 && !(e.flags & 16) || (e.flags &= -17, e.globalVersion === Pt) || (e.globalVersion = Pt, !e.isSSR && e.flags & 128 && (!e.deps && !e._dirty || !$s(e))))
    return;
  e.flags |= 2;
  const t = e.dep, s = q, n = ve;
  q = e, ve = !0;
  try {
    fr(e);
    const r = e.fn(e._value);
    (t.version === 0 || Re(r, e._value)) && (e.flags |= 128, e._value = r, t.version++);
  } catch (r) {
    throw t.version++, r;
  } finally {
    q = s, ve = n, ar(e), e.flags &= -3;
  }
}
function Qs(e, t = !1) {
  const { dep: s, prevSub: n, nextSub: r } = e;
  if (n && (n.nextSub = r, e.prevSub = void 0), r && (r.prevSub = n, e.nextSub = void 0), s.subs === e && (s.subs = n, !n && s.computed)) {
    s.computed.flags &= -5;
    for (let i = s.computed.deps; i; i = i.nextDep)
      Qs(i, !0);
  }
  !t && !--s.sc && s.map && s.map.delete(s.key);
}
function wi(e) {
  const { prevDep: t, nextDep: s } = e;
  t && (t.nextDep = s, e.prevDep = void 0), s && (s.prevDep = t, e.nextDep = void 0);
}
let ve = !0;
const dr = [];
function $e() {
  dr.push(ve), ve = !1;
}
function Fe() {
  const e = dr.pop();
  ve = e === void 0 ? !0 : e;
}
function Cn(e) {
  const { cleanup: t } = e;
  if (e.cleanup = void 0, t) {
    const s = q;
    q = void 0;
    try {
      t();
    } finally {
      q = s;
    }
  }
}
let Pt = 0;
class Si {
  constructor(t, s) {
    this.sub = t, this.dep = s, this.version = s.version, this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
  }
}
class en {
  // TODO isolatedDeclarations "__v_skip"
  constructor(t) {
    this.computed = t, this.version = 0, this.activeLink = void 0, this.subs = void 0, this.map = void 0, this.key = void 0, this.sc = 0, this.__v_skip = !0;
  }
  track(t) {
    if (!q || !ve || q === this.computed)
      return;
    let s = this.activeLink;
    if (s === void 0 || s.sub !== q)
      s = this.activeLink = new Si(q, this), q.deps ? (s.prevDep = q.depsTail, q.depsTail.nextDep = s, q.depsTail = s) : q.deps = q.depsTail = s, hr(s);
    else if (s.version === -1 && (s.version = this.version, s.nextDep)) {
      const n = s.nextDep;
      n.prevDep = s.prevDep, s.prevDep && (s.prevDep.nextDep = n), s.prevDep = q.depsTail, s.nextDep = void 0, q.depsTail.nextDep = s, q.depsTail = s, q.deps === s && (q.deps = n);
    }
    return s;
  }
  trigger(t) {
    this.version++, Pt++, this.notify(t);
  }
  notify(t) {
    Xs();
    try {
      for (let s = this.subs; s; s = s.prevSub)
        s.sub.notify() && s.sub.dep.notify();
    } finally {
      Zs();
    }
  }
}
function hr(e) {
  if (e.dep.sc++, e.sub.flags & 4) {
    const t = e.dep.computed;
    if (t && !e.dep.subs) {
      t.flags |= 20;
      for (let n = t.deps; n; n = n.nextDep)
        hr(n);
    }
    const s = e.dep.subs;
    s !== e && (e.prevSub = s, s && (s.nextSub = e)), e.dep.subs = e;
  }
}
const Fs = /* @__PURE__ */ new WeakMap(), nt = /* @__PURE__ */ Symbol(
  ""
), js = /* @__PURE__ */ Symbol(
  ""
), It = /* @__PURE__ */ Symbol(
  ""
);
function re(e, t, s) {
  if (ve && q) {
    let n = Fs.get(e);
    n || Fs.set(e, n = /* @__PURE__ */ new Map());
    let r = n.get(s);
    r || (n.set(s, r = new en()), r.map = n, r.key = s), r.track();
  }
}
function Le(e, t, s, n, r, i) {
  const l = Fs.get(e);
  if (!l) {
    Pt++;
    return;
  }
  const o = (f) => {
    f && f.trigger();
  };
  if (Xs(), t === "clear")
    l.forEach(o);
  else {
    const f = I(e), d = f && Js(s);
    if (f && s === "length") {
      const a = Number(n);
      l.forEach((h, p) => {
        (p === "length" || p === It || !we(p) && p >= a) && o(h);
      });
    } else
      switch ((s !== void 0 || l.has(void 0)) && o(l.get(s)), d && o(l.get(It)), t) {
        case "add":
          f ? d && o(l.get("length")) : (o(l.get(nt)), ze(e) && o(l.get(js)));
          break;
        case "delete":
          f || (o(l.get(nt)), ze(e) && o(l.get(js)));
          break;
        case "set":
          ze(e) && o(l.get(nt));
          break;
      }
  }
  Zs();
}
function lt(e) {
  const t = /* @__PURE__ */ L(e);
  return t === e || (re(t, "iterate", It), /* @__PURE__ */ me(e)) ? t : /* @__PURE__ */ je(e) ? /* @__PURE__ */ Ge(e) ? t.map((s) => Je(be(s))) : t.map(Je) : t.map(be);
}
function hs(e) {
  return re(e = /* @__PURE__ */ L(e), "iterate", It), e;
}
function Pe(e, t) {
  return /* @__PURE__ */ je(e) ? Je(/* @__PURE__ */ Ge(e) ? be(t) : t) : be(t);
}
const Ti = {
  __proto__: null,
  [Symbol.iterator]() {
    return Ts(this, Symbol.iterator, (e) => Pe(this, e));
  },
  concat(...e) {
    return lt(this).concat(
      ...e.map((t) => I(t) ? lt(t) : t)
    );
  },
  entries() {
    return Ts(this, "entries", (e) => (e[1] = Pe(this, e[1]), e));
  },
  every(e, t) {
    return Ne(this, "every", e, t, void 0, arguments);
  },
  filter(e, t) {
    return Ne(
      this,
      "filter",
      e,
      t,
      (s) => s.map((n) => Pe(this, n)),
      arguments
    );
  },
  find(e, t) {
    return Ne(
      this,
      "find",
      e,
      t,
      (s) => Pe(this, s),
      arguments
    );
  },
  findIndex(e, t) {
    return Ne(this, "findIndex", e, t, void 0, arguments);
  },
  findLast(e, t) {
    return Ne(
      this,
      "findLast",
      e,
      t,
      (s) => Pe(this, s),
      arguments
    );
  },
  findLastIndex(e, t) {
    return Ne(this, "findLastIndex", e, t, void 0, arguments);
  },
  // flat, flatMap could benefit from ARRAY_ITERATE but are not straight-forward to implement
  forEach(e, t) {
    return Ne(this, "forEach", e, t, void 0, arguments);
  },
  includes(...e) {
    return Cs(this, "includes", e);
  },
  indexOf(...e) {
    return Cs(this, "indexOf", e);
  },
  join(e) {
    return lt(this).join(e);
  },
  // keys() iterator only reads `length`, no optimization required
  lastIndexOf(...e) {
    return Cs(this, "lastIndexOf", e);
  },
  map(e, t) {
    return Ne(this, "map", e, t, void 0, arguments);
  },
  pop() {
    return _t(this, "pop");
  },
  push(...e) {
    return _t(this, "push", e);
  },
  reduce(e, ...t) {
    return On(this, "reduce", e, t);
  },
  reduceRight(e, ...t) {
    return On(this, "reduceRight", e, t);
  },
  shift() {
    return _t(this, "shift");
  },
  // slice could use ARRAY_ITERATE but also seems to beg for range tracking
  some(e, t) {
    return Ne(this, "some", e, t, void 0, arguments);
  },
  splice(...e) {
    return _t(this, "splice", e);
  },
  toReversed() {
    return lt(this).toReversed();
  },
  toSorted(e) {
    return lt(this).toSorted(e);
  },
  toSpliced(...e) {
    return lt(this).toSpliced(...e);
  },
  unshift(...e) {
    return _t(this, "unshift", e);
  },
  values() {
    return Ts(this, "values", (e) => Pe(this, e));
  }
};
function Ts(e, t, s) {
  const n = hs(e), r = n[t], i = r.call(n);
  if (n !== e && !/* @__PURE__ */ me(e)) {
    if (i[Symbol.toStringTag] === "Array Iterator") {
      const l = Object.create(Object.getPrototypeOf(i));
      return l.next = () => En(i.next(), s), r !== gr[t] && Object.defineProperties(l, {
        return: {
          get() {
            const o = i.return;
            return typeof o == "function" ? o.bind(i) : o;
          }
        },
        throw: {
          get() {
            const o = i.throw;
            return typeof o == "function" ? o.bind(i) : o;
          }
        }
      }), l;
    }
    i._next = i.next, i.next = () => En(i._next(), s);
  }
  return i;
}
function En(e, t) {
  return e.done || (e.value = t(e.value)), e;
}
const gr = Array.prototype;
function Ne(e, t, s, n, r, i) {
  const l = hs(e), o = l !== e && !/* @__PURE__ */ me(e), f = l[t];
  if (f !== gr[t]) {
    const h = f.apply(e, i);
    return o ? be(h) : h;
  }
  let d = s;
  l !== e && (o ? d = function(h, p) {
    return s.call(this, Pe(e, h), p, e);
  } : s.length > 2 && (d = function(h, p) {
    return s.call(this, h, p, e);
  }));
  const a = f.call(l, d, n);
  return o && r ? r(a) : a;
}
function On(e, t, s, n) {
  const r = hs(e), i = r !== e && !/* @__PURE__ */ me(e);
  let l = s, o = !1;
  r !== e && (i ? (o = n.length === 0, l = function(d, a, h) {
    return o && (o = !1, d = Pe(e, d)), s.call(this, d, Pe(e, a), h, e);
  }) : s.length > 3 && (l = function(d, a, h) {
    return s.call(this, d, a, h, e);
  }));
  const f = r[t](l, ...n);
  return o ? Pe(e, f) : f;
}
function Cs(e, t, s) {
  const n = /* @__PURE__ */ L(e);
  re(n, "iterate", It);
  const r = n[t](...s);
  return (r === -1 || r === !1) && /* @__PURE__ */ rn(s[0]) ? (s[0] = /* @__PURE__ */ L(s[0]), n[t](...s)) : r;
}
function _t(e, t, s = []) {
  $e(), Xs();
  const n = (/* @__PURE__ */ L(e))[t].apply(e, s);
  return Zs(), Fe(), n;
}
const Ci = /* @__PURE__ */ zs("__proto__,__v_isRef,__isVue"), pr = new Set(
  /* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((e) => e !== "arguments" && e !== "caller").map((e) => Symbol[e]).filter(we)
);
function Ei(e) {
  we(e) || (e = String(e));
  const t = /* @__PURE__ */ L(this);
  return re(t, "has", e), t.hasOwnProperty(e);
}
class mr {
  constructor(t = !1, s = !1) {
    this._isReadonly = t, this._isShallow = s;
  }
  get(t, s, n) {
    if (s === "__v_skip") return t.__v_skip;
    const r = this._isReadonly, i = this._isShallow;
    if (s === "__v_isReactive")
      return !r;
    if (s === "__v_isReadonly")
      return r;
    if (s === "__v_isShallow")
      return i;
    if (s === "__v_raw")
      return n === (r ? i ? ji : xr : i ? _r : yr).get(t) || // receiver is not the reactive proxy, but has the same prototype
      // this means the receiver is a user proxy of the reactive proxy
      Object.getPrototypeOf(t) === Object.getPrototypeOf(n) ? t : void 0;
    const l = I(t);
    if (!r) {
      let f;
      if (l && (f = Ti[s]))
        return f;
      if (s === "hasOwnProperty")
        return Ei;
    }
    const o = Reflect.get(
      t,
      s,
      // if this is a proxy wrapping a ref, return methods using the raw ref
      // as receiver so that we don't have to call `toRaw` on the ref in all
      // its class methods
      /* @__PURE__ */ le(t) ? t : n
    );
    if ((we(s) ? pr.has(s) : Ci(s)) || (r || re(t, "get", s), i))
      return o;
    if (/* @__PURE__ */ le(o)) {
      const f = l && Js(s) ? o : o.value;
      return r && B(f) ? /* @__PURE__ */ Ds(f) : f;
    }
    return B(o) ? r ? /* @__PURE__ */ Ds(o) : /* @__PURE__ */ sn(o) : o;
  }
}
class br extends mr {
  constructor(t = !1) {
    super(!1, t);
  }
  set(t, s, n, r) {
    let i = t[s];
    const l = I(t) && Js(s);
    if (!this._isShallow) {
      const d = /* @__PURE__ */ je(i);
      if (!/* @__PURE__ */ me(n) && !/* @__PURE__ */ je(n) && (i = /* @__PURE__ */ L(i), n = /* @__PURE__ */ L(n)), !l && /* @__PURE__ */ le(i) && !/* @__PURE__ */ le(n))
        return d || (i.value = n), !0;
    }
    const o = l ? Number(s) < t.length : D(t, s), f = Reflect.set(
      t,
      s,
      n,
      /* @__PURE__ */ le(t) ? t : r
    );
    return t === /* @__PURE__ */ L(r) && f && (o ? Re(n, i) && Le(t, "set", s, n) : Le(t, "add", s, n)), f;
  }
  deleteProperty(t, s) {
    const n = D(t, s);
    t[s];
    const r = Reflect.deleteProperty(t, s);
    return r && n && Le(t, "delete", s, void 0), r;
  }
  has(t, s) {
    const n = Reflect.has(t, s);
    return (!we(s) || !pr.has(s)) && re(t, "has", s), n;
  }
  ownKeys(t) {
    return re(
      t,
      "iterate",
      I(t) ? "length" : nt
    ), Reflect.ownKeys(t);
  }
}
class Oi extends mr {
  constructor(t = !1) {
    super(!0, t);
  }
  set(t, s) {
    return !0;
  }
  deleteProperty(t, s) {
    return !0;
  }
}
const Ai = /* @__PURE__ */ new br(), Pi = /* @__PURE__ */ new Oi(), Ii = /* @__PURE__ */ new br(!0);
const Ns = (e) => e, Kt = (e) => Reflect.getPrototypeOf(e);
function Mi(e, t, s) {
  return function(...n) {
    const r = this.__v_raw, i = /* @__PURE__ */ L(r), l = ze(i), o = e === "entries" || e === Symbol.iterator && l, f = e === "keys" && l, d = r[e](...n), a = s ? Ns : t ? Je : be;
    return !t && re(
      i,
      "iterate",
      f ? js : nt
    ), ne(
      // inheriting all iterator properties
      Object.create(d),
      {
        // iterator protocol
        next() {
          const { value: h, done: p } = d.next();
          return p ? { value: h, done: p } : {
            value: o ? [a(h[0]), a(h[1])] : a(h),
            done: p
          };
        }
      }
    );
  };
}
function Vt(e) {
  return function(...t) {
    return e === "delete" ? !1 : e === "clear" ? void 0 : this;
  };
}
function Ri(e, t) {
  const s = {
    get(r) {
      const i = this.__v_raw, l = /* @__PURE__ */ L(i), o = /* @__PURE__ */ L(r);
      e || (Re(r, o) && re(l, "get", r), re(l, "get", o));
      const { has: f } = Kt(l), d = t ? Ns : e ? Je : be;
      if (f.call(l, r))
        return d(i.get(r));
      if (f.call(l, o))
        return d(i.get(o));
      i !== l && i.get(r);
    },
    get size() {
      const r = this.__v_raw;
      return !e && re(/* @__PURE__ */ L(r), "iterate", nt), r.size;
    },
    has(r) {
      const i = this.__v_raw, l = /* @__PURE__ */ L(i), o = /* @__PURE__ */ L(r);
      return e || (Re(r, o) && re(l, "has", r), re(l, "has", o)), r === o ? i.has(r) : i.has(r) || i.has(o);
    },
    forEach(r, i) {
      const l = this, o = l.__v_raw, f = /* @__PURE__ */ L(o), d = t ? Ns : e ? Je : be;
      return !e && re(f, "iterate", nt), o.forEach((a, h) => r.call(i, d(a), d(h), l));
    }
  };
  return ne(
    s,
    e ? {
      add: Vt("add"),
      set: Vt("set"),
      delete: Vt("delete"),
      clear: Vt("clear")
    } : {
      add(r) {
        const i = /* @__PURE__ */ L(this), l = Kt(i), o = /* @__PURE__ */ L(r), f = !t && !/* @__PURE__ */ me(r) && !/* @__PURE__ */ je(r) ? o : r;
        return l.has.call(i, f) || Re(r, f) && l.has.call(i, r) || Re(o, f) && l.has.call(i, o) || (i.add(f), Le(i, "add", f, f)), this;
      },
      set(r, i) {
        !t && !/* @__PURE__ */ me(i) && !/* @__PURE__ */ je(i) && (i = /* @__PURE__ */ L(i));
        const l = /* @__PURE__ */ L(this), { has: o, get: f } = Kt(l);
        let d = o.call(l, r);
        d || (r = /* @__PURE__ */ L(r), d = o.call(l, r));
        const a = f.call(l, r);
        return l.set(r, i), d ? Re(i, a) && Le(l, "set", r, i) : Le(l, "add", r, i), this;
      },
      delete(r) {
        const i = /* @__PURE__ */ L(this), { has: l, get: o } = Kt(i);
        let f = l.call(i, r);
        f || (r = /* @__PURE__ */ L(r), f = l.call(i, r)), o && o.call(i, r);
        const d = i.delete(r);
        return f && Le(i, "delete", r, void 0), d;
      },
      clear() {
        const r = /* @__PURE__ */ L(this), i = r.size !== 0, l = r.clear();
        return i && Le(
          r,
          "clear",
          void 0,
          void 0
        ), l;
      }
    }
  ), [
    "keys",
    "values",
    "entries",
    Symbol.iterator
  ].forEach((r) => {
    s[r] = Mi(r, e, t);
  }), s;
}
function tn(e, t) {
  const s = Ri(e, t);
  return (n, r, i) => r === "__v_isReactive" ? !e : r === "__v_isReadonly" ? e : r === "__v_isShallow" ? t : r === "__v_raw" ? n : Reflect.get(
    D(s, r) && r in n ? s : n,
    r,
    i
  );
}
const ki = {
  get: /* @__PURE__ */ tn(!1, !1)
}, $i = {
  get: /* @__PURE__ */ tn(!1, !0)
}, Fi = {
  get: /* @__PURE__ */ tn(!0, !1)
};
const yr = /* @__PURE__ */ new WeakMap(), _r = /* @__PURE__ */ new WeakMap(), xr = /* @__PURE__ */ new WeakMap(), ji = /* @__PURE__ */ new WeakMap();
function Ni(e) {
  switch (e) {
    case "Object":
    case "Array":
      return 1;
    case "Map":
    case "Set":
    case "WeakMap":
    case "WeakSet":
      return 2;
    default:
      return 0;
  }
}
// @__NO_SIDE_EFFECTS__
function sn(e) {
  return /* @__PURE__ */ je(e) ? e : nn(
    e,
    !1,
    Ai,
    ki,
    yr
  );
}
// @__NO_SIDE_EFFECTS__
function Di(e) {
  return nn(
    e,
    !1,
    Ii,
    $i,
    _r
  );
}
// @__NO_SIDE_EFFECTS__
function Ds(e) {
  return nn(
    e,
    !0,
    Pi,
    Fi,
    xr
  );
}
function nn(e, t, s, n, r) {
  if (!B(e) || e.__v_raw && !(t && e.__v_isReactive) || e.__v_skip || !Object.isExtensible(e))
    return e;
  const i = r.get(e);
  if (i)
    return i;
  const l = Ni(ci(e));
  if (l === 0)
    return e;
  const o = new Proxy(
    e,
    l === 2 ? n : s
  );
  return r.set(e, o), o;
}
// @__NO_SIDE_EFFECTS__
function Ge(e) {
  return /* @__PURE__ */ je(e) ? /* @__PURE__ */ Ge(e.__v_raw) : !!(e && e.__v_isReactive);
}
// @__NO_SIDE_EFFECTS__
function je(e) {
  return !!(e && e.__v_isReadonly);
}
// @__NO_SIDE_EFFECTS__
function me(e) {
  return !!(e && e.__v_isShallow);
}
// @__NO_SIDE_EFFECTS__
function rn(e) {
  return e ? !!e.__v_raw : !1;
}
// @__NO_SIDE_EFFECTS__
function L(e) {
  const t = e && e.__v_raw;
  return t ? /* @__PURE__ */ L(t) : e;
}
function Hi(e) {
  return !D(e, "__v_skip") && Object.isExtensible(e) && sr(e, "__v_skip", !0), e;
}
const be = (e) => B(e) ? /* @__PURE__ */ sn(e) : e, Je = (e) => B(e) ? /* @__PURE__ */ Ds(e) : e;
// @__NO_SIDE_EFFECTS__
function le(e) {
  return e ? e.__v_isRef === !0 : !1;
}
// @__NO_SIDE_EFFECTS__
function vt(e) {
  return Li(e, !1);
}
function Li(e, t) {
  return /* @__PURE__ */ le(e) ? e : new Bi(e, t);
}
class Bi {
  constructor(t, s) {
    this.dep = new en(), this.__v_isRef = !0, this.__v_isShallow = !1, this._rawValue = s ? t : /* @__PURE__ */ L(t), this._value = s ? t : be(t), this.__v_isShallow = s;
  }
  get value() {
    return this.dep.track(), this._value;
  }
  set value(t) {
    const s = this._rawValue, n = this.__v_isShallow || /* @__PURE__ */ me(t) || /* @__PURE__ */ je(t);
    t = n ? t : /* @__PURE__ */ L(t), Re(t, s) && (this._rawValue = t, this._value = n ? t : be(t), this.dep.trigger());
  }
}
function Ui(e) {
  return /* @__PURE__ */ le(e) ? e.value : e;
}
const Ki = {
  get: (e, t, s) => t === "__v_raw" ? e : Ui(Reflect.get(e, t, s)),
  set: (e, t, s, n) => {
    const r = e[t];
    return /* @__PURE__ */ le(r) && !/* @__PURE__ */ le(s) ? (r.value = s, !0) : Reflect.set(e, t, s, n);
  }
};
function vr(e) {
  return /* @__PURE__ */ Ge(e) ? e : new Proxy(e, Ki);
}
class Vi {
  constructor(t, s, n) {
    this.fn = t, this.setter = s, this._value = void 0, this.dep = new en(this), this.__v_isRef = !0, this.deps = void 0, this.depsTail = void 0, this.flags = 16, this.globalVersion = Pt - 1, this.next = void 0, this.effect = this, this.__v_isReadonly = !s, this.isSSR = n;
  }
  /**
   * @internal
   */
  notify() {
    if (this.flags |= 16, !(this.flags & 8) && // avoid infinite self recursion
    q !== this)
      return cr(this, !0), !0;
  }
  get value() {
    const t = this.dep.track();
    return ur(this), t && (t.version = this.dep.version), this._value;
  }
  set value(t) {
    this.setter && this.setter(t);
  }
}
// @__NO_SIDE_EFFECTS__
function Wi(e, t, s = !1) {
  let n, r;
  return k(e) ? n = e : (n = e.get, r = e.set), new Vi(n, r, s);
}
const Wt = {}, Xt = /* @__PURE__ */ new WeakMap();
let tt;
function qi(e, t = !1, s = tt) {
  if (s) {
    let n = Xt.get(s);
    n || Xt.set(s, n = []), n.push(e);
  }
}
function zi(e, t, s = z) {
  const { immediate: n, deep: r, once: i, scheduler: l, augmentJob: o, call: f } = s, d = (A) => r ? A : /* @__PURE__ */ me(A) || r === !1 || r === 0 ? qe(A, 1) : qe(A);
  let a, h, p, T, F = !1, M = !1;
  if (/* @__PURE__ */ le(e) ? (h = () => e.value, F = /* @__PURE__ */ me(e)) : /* @__PURE__ */ Ge(e) ? (h = () => d(e), F = !0) : I(e) ? (M = !0, F = e.some((A) => /* @__PURE__ */ Ge(A) || /* @__PURE__ */ me(A)), h = () => e.map((A) => {
    if (/* @__PURE__ */ le(A))
      return A.value;
    if (/* @__PURE__ */ Ge(A))
      return d(A);
    if (k(A))
      return f ? f(A, 2) : A();
  })) : k(e) ? t ? h = f ? () => f(e, 2) : e : h = () => {
    if (p) {
      $e();
      try {
        p();
      } finally {
        Fe();
      }
    }
    const A = tt;
    tt = a;
    try {
      return f ? f(e, 3, [T]) : e(T);
    } finally {
      tt = A;
    }
  } : h = ke, t && r) {
    const A = h, Q = r === !0 ? 1 / 0 : r;
    h = () => qe(A(), Q);
  }
  const J = vi(), $ = () => {
    a.stop(), J && J.active && Gs(J.effects, a);
  };
  if (i && t) {
    const A = t;
    t = (...Q) => {
      try {
        return A(...Q);
      } finally {
        $();
      }
    };
  }
  let E = M ? new Array(e.length).fill(Wt) : Wt;
  const P = (A) => {
    if (!(!(a.flags & 1) || !a.dirty && !A))
      if (t) {
        const Q = a.run();
        if (A || r || F || (M ? Q.some((Ke, Te) => Re(Ke, E[Te])) : Re(Q, E))) {
          const Ke = tt;
          $e();
          try {
            p && p(), tt = a;
            const Te = [
              Q,
              // pass undefined as the old value when it's changed for the first time
              E === Wt ? void 0 : M && E[0] === Wt ? [] : E,
              T
            ];
            E = Q, f ? f(t, 3, Te) : (
              // @ts-expect-error
              t(...Te)
            );
          } finally {
            tt = Ke, Fe();
          }
        }
      } else
        a.run();
  };
  return o && o(P), a = new lr(h), a.scheduler = l ? () => l(P, !1) : P, T = (A) => qi(A, !1, a), p = a.onStop = () => {
    const A = Xt.get(a);
    if (A) {
      if (f)
        f(A, 4);
      else
        for (const Q of A) Q();
      Xt.delete(a);
    }
  }, t ? n ? P(!0) : E = a.run() : l ? l(P.bind(null, !0), !0) : a.run(), $.pause = a.pause.bind(a), $.resume = a.resume.bind(a), $.stop = $, $;
}
function qe(e, t = 1 / 0, s) {
  if (t <= 0 || !B(e) || e.__v_skip || (s = s || /* @__PURE__ */ new Map(), (s.get(e) || 0) >= t))
    return e;
  if (s.set(e, t), t--, /* @__PURE__ */ le(e))
    qe(e.value, t, s);
  else if (I(e))
    for (let n = 0; n < e.length; n++)
      qe(e[n], t, s);
  else if (Yt(e) || ze(e))
    e.forEach((n) => {
      qe(n, t, s);
    });
  else if (tr(e)) {
    for (const n in e)
      qe(e[n], t, s);
    for (const n of Object.getOwnPropertySymbols(e))
      Object.prototype.propertyIsEnumerable.call(e, n) && qe(e[n], t, s);
  }
  return e;
}
function jt(e, t, s, n) {
  try {
    return n ? e(...n) : e();
  } catch (r) {
    gs(r, t, s);
  }
}
function Se(e, t, s, n) {
  if (k(e)) {
    const r = jt(e, t, s, n);
    return r && Qn(r) && r.catch((i) => {
      gs(i, t, s);
    }), r;
  }
  if (I(e)) {
    const r = [];
    for (let i = 0; i < e.length; i++)
      r.push(Se(e[i], t, s, n));
    return r;
  }
}
function gs(e, t, s, n = !0) {
  const r = t ? t.vnode : null, { errorHandler: i, throwUnhandledErrorInProduction: l } = t && t.appContext.config || z;
  if (t) {
    let o = t.parent;
    const f = t.proxy, d = `https://vuejs.org/error-reference/#runtime-${s}`;
    for (; o; ) {
      const a = o.ec;
      if (a) {
        for (let h = 0; h < a.length; h++)
          if (a[h](e, f, d) === !1)
            return;
      }
      o = o.parent;
    }
    if (i) {
      $e(), jt(i, null, 10, [
        e,
        f,
        d
      ]), Fe();
      return;
    }
  }
  Gi(e, s, r, n, l);
}
function Gi(e, t, s, n = !0, r = !1) {
  if (r)
    throw e;
  console.error(e);
}
const fe = [];
let xe = -1;
const Ie = [];
let We = null, ot = 0;
const wr = /* @__PURE__ */ Promise.resolve();
let Zt = null;
function Ji(e) {
  const t = Zt || wr;
  return e ? t.then(this ? e.bind(this) : e) : t;
}
function Yi(e) {
  let t = xe + 1, s = fe.length;
  for (; t < s; ) {
    const n = t + s >>> 1, r = fe[n], i = Mt(r);
    i < e || i === e && r.flags & 2 ? t = n + 1 : s = n;
  }
  return t;
}
function ln(e) {
  if (!(e.flags & 1)) {
    const t = Mt(e), s = fe[fe.length - 1];
    !s || // fast path when the job id is larger than the tail
    !(e.flags & 2) && t >= Mt(s) ? fe.push(e) : fe.splice(Yi(t), 0, e), e.flags |= 1, Sr();
  }
}
function Sr() {
  Zt || (Zt = wr.then(Er));
}
function Xi(e) {
  if (!I(e))
    We && e.id === -1 ? We.splice(ot + 1, 0, e) : e.flags & 1 || (Ie.push(e), e.flags |= 1);
  else
    for (let t = 0; t < e.length; t++)
      Ie.push(e[t]);
  Sr();
}
function Tr(e, t, s, n = xe + 1) {
  for (; n < fe.length; n++) {
    const r = fe[n];
    if (r && r.flags & 2) {
      if (e && r.id !== e.uid || t !== void 0 && !(r.id >= t))
        continue;
      fe.splice(n, 1), n = e ? n - 1 : xe, r.flags & 4 && (r.flags &= -2), r(), r.flags & 4 || (r.flags &= -2);
    }
  }
}
function Cr(e, t, s = 0) {
  if (Ie.length) {
    let n = Ie, r = 0;
    if (t) {
      n = [];
      for (let l = 0; l < Ie.length; l++) {
        const o = Ie[l];
        (o.i !== void 0 ? !o.i || o.i.uid < s : t.has(o)) ? Ie[r++] = o : n.push(o);
      }
    }
    const i = [...new Set(n)].sort((l, o) => Mt(l) - Mt(o));
    if (Ie.length = r, We) {
      for (let l = 0; l < i.length; l++)
        We.push(i[l]);
      return;
    }
    for (We = i, ot = 0; ot < We.length; ot++) {
      const l = We[ot];
      l.flags & 4 && (l.flags &= -2), l.flags & 8 || l(), l.flags &= -2;
    }
    We = null, ot = 0;
  }
}
let Es = !1;
function Zi(e, t) {
  if (Es) {
    e();
    return;
  }
  const s = t === void 0 ? void 0 : new Set(Ie);
  e(), Es = !0;
  try {
    Tr(void 0, t), Cr(void 0, s, t);
  } finally {
    Es = !1;
  }
}
const Mt = (e) => e.id == null ? e.flags & 2 ? -1 : 1 / 0 : e.id;
function Er(e) {
  try {
    for (xe = 0; xe < fe.length; xe++) {
      const t = fe[xe];
      t && !(t.flags & 8) && (t.flags & 4 && (t.flags &= -2), jt(
        t,
        t.i,
        t.i ? 15 : 14
      ), t.flags & 4 || (t.flags &= -2));
    }
  } finally {
    for (; xe < fe.length; xe++) {
      const t = fe[xe];
      t && (t.flags &= -2);
    }
    xe = -1, fe.length = 0, Cr(), Zt = null, (fe.length || Ie.length) && Er();
  }
}
let ae = null, Or = null;
function Qt(e) {
  const t = ae;
  return ae = e, Or = e && e.type.__scopeId || null, t;
}
function es(e, t = ae, s) {
  if (!t || e._n)
    return e;
  const n = (...r) => {
    n._d && rs(-1);
    const i = Qt(t), l = Be.length;
    let o;
    try {
      o = e(...r);
    } finally {
      for (let f = Be.length; f > l; f--) dn();
      Qt(i), n._d && rs(1);
    }
    return o;
  };
  return n._n = !0, n._c = !0, n._d = !0, n;
}
function Qe(e, t, s, n) {
  const r = e.dirs, i = t && t.dirs;
  for (let l = 0; l < r.length; l++) {
    const o = r[l];
    i && (o.oldValue = i[l].value);
    let f = o.dir[n];
    f && ($e(), Se(f, s, 8, [
      e.el,
      o,
      e,
      t
    ]), Fe());
  }
}
function Qi(e, t) {
  if (ie) {
    let s = ie.provides;
    const n = ie.parent && ie.parent.provides;
    n === s && (s = ie.provides = Object.create(n)), s[e] = t;
  }
}
function zt(e, t, s = !1) {
  const n = Xl();
  if (n || dt) {
    let r = dt ? dt._context.provides : n ? n.parent == null || n.ce ? n.vnode.appContext && n.vnode.appContext.provides : n.parent.provides : void 0;
    if (r && e in r)
      return r[e];
    if (arguments.length > 1)
      return s && k(t) ? t.call(n && n.proxy) : t;
  }
}
const el = /* @__PURE__ */ Symbol.for("v-scx"), tl = () => zt(el);
function Gt(e, t, s) {
  return Ar(e, t, s);
}
function Ar(e, t, s = z) {
  const { immediate: n, deep: r, flush: i, once: l } = s, o = ne({}, s), f = t && n || !t && i !== "post";
  let d;
  if ($t) {
    if (i === "sync") {
      const T = tl();
      d = T.__watcherHandles || (T.__watcherHandles = []);
    } else if (!f) {
      const T = () => {
      };
      return T.stop = ke, T.resume = ke, T.pause = ke, T;
    }
  }
  const a = ie;
  o.call = (T, F, M) => Se(T, a, F, M);
  let h = !1;
  i === "post" ? o.scheduler = (T) => {
    T.i = a, de(T, a && a.suspense);
  } : i !== "sync" && (h = !0, o.scheduler = (T, F) => {
    F ? T() : ln(T);
  }), o.augmentJob = (T) => {
    t && (T.flags |= 4), h && (T.flags |= 2, a && (T.id = a.uid, T.i = a));
  };
  const p = zi(e, t, o);
  return $t && (d ? d.push(p) : f && p()), p;
}
function sl(e, t, s) {
  const n = this.proxy, r = X(e) ? e.includes(".") ? Pr(n, e) : () => n[e] : e.bind(n, n);
  let i;
  k(t) ? i = t : (i = t.handler, s = t);
  const l = Nt(this), o = Ar(r, i.bind(n), s);
  return l(), o;
}
function Pr(e, t) {
  const s = t.split(".");
  return () => {
    let n = e;
    for (let r = 0; r < s.length && n; r++)
      n = n[s[r]];
    return n;
  };
}
const nl = /* @__PURE__ */ Symbol("_vte"), ps = (e) => e.__isTeleport, Os = /* @__PURE__ */ Symbol("_leaveCb");
function rl(e) {
  let t = e[0];
  if (e.length > 1) {
    for (const s of e)
      if (s.type !== ye) {
        t = s;
        break;
      }
  }
  return t;
}
function Ir(e) {
  if (!cn(e))
    return ps(e.type) && e.children ? rl(e.children) : e;
  if (e.component)
    return e.component.subTree;
  const { shapeFlag: t, children: s } = e;
  if (s) {
    if (t & 16)
      return s[0];
    if (t & 32 && k(s.default))
      return s.default();
  }
}
function ts(e, t) {
  if (e.shapeFlag & 6 && e.component) {
    e.transition = t;
    const s = e.component.subTree;
    ts(
      ps(s.type) && Ir(s) || s,
      t
    );
  } else if (e.shapeFlag & 128)
    e.ssContent.transition = t.clone(e.ssContent), e.ssFallback.transition = t.clone(e.ssFallback);
  else if (e.transition = t, e.type === se && I(e.children)) {
    const s = Lr(e.children, !1);
    s && ts(s, t);
  }
}
function Hs(e) {
  if (e.component)
    return Hs(e.component.subTree);
  if (e.type === se) {
    const t = I(e.children) && Lr(e.children, !1);
    return t ? Hs(t) : void 0;
  }
  if (e.type !== ye)
    return e;
}
// @__NO_SIDE_EFFECTS__
function on(e, t) {
  return k(e) ? (
    // #8236: extend call and options.name access are considered side-effects
    // by Rollup, so we have to wrap it in a pure-annotated IIFE.
    ne({ name: e.name }, t, { setup: e })
  ) : e;
}
function Mr(e) {
  e.ids = [e.ids[0] + e.ids[2]++ + "-", 0, 0];
}
function An(e, t) {
  let s;
  return !!((s = Object.getOwnPropertyDescriptor(e, t)) && !s.configurable);
}
const ss = /* @__PURE__ */ new WeakMap();
function Ot(e, t, s, n, r = !1) {
  if (I(e)) {
    e.forEach(
      (M, J) => Ot(
        M,
        t && (I(t) ? t[J] : t),
        s,
        n,
        r
      )
    );
    return;
  }
  if (ut(n) && !r) {
    n.shapeFlag & 512 && n.type.__asyncResolved && n.component.subTree.component && Ot(e, t, s, n.component.subTree);
    return;
  }
  const i = n.shapeFlag & 4 ? hn(n.component) : n.el, l = r ? null : i, { i: o, r: f } = e, d = t && t.r, a = o.refs === z ? o.refs = {} : o.refs, h = o.setupState, p = /* @__PURE__ */ L(h), T = h === z ? Zn : (M) => An(a, M) ? !1 : D(p, M), F = (M, J) => !(J && An(a, J));
  if (d != null && d !== f) {
    if (Pn(t), X(d))
      a[d] = null, T(d) && (h[d] = null);
    else if (/* @__PURE__ */ le(d)) {
      const M = t;
      F(d, M.k) && (d.value = null), M.k && (a[M.k] = null);
    }
  }
  if (k(f))
    jt(f, o, 12, [l, a]);
  else {
    const M = X(f), J = /* @__PURE__ */ le(f);
    if (M || J) {
      const $ = () => {
        if (e.f) {
          const E = M ? T(f) ? h[f] : a[f] : F() || !e.k ? f.value : a[e.k];
          if (r)
            I(E) && Gs(E, i);
          else if (I(E))
            E.includes(i) || E.push(i);
          else if (M)
            a[f] = [i], T(f) && (h[f] = a[f]);
          else {
            const P = [i];
            F(f, e.k) && (f.value = P), e.k && (a[e.k] = P);
          }
        } else M ? (a[f] = l, T(f) && (h[f] = l)) : J && (F(f, e.k) && (f.value = l), e.k && (a[e.k] = l));
      };
      if (l) {
        const E = () => {
          $(), ss.delete(e);
        };
        E.id = -1, ss.set(e, E), de(E, s);
      } else
        Pn(e), $();
    }
  }
}
function Pn(e) {
  const t = ss.get(e);
  t && (t.flags |= 8, ss.delete(e));
}
us().requestIdleCallback;
us().cancelIdleCallback;
const ut = (e) => !!e.type.__asyncLoader, cn = (e) => e.type.__isKeepAlive;
function il(e, t) {
  Rr(e, "a", t);
}
function ll(e, t) {
  Rr(e, "da", t);
}
function Rr(e, t, s = ie) {
  const n = e.__wdc || (e.__wdc = () => {
    let r = s;
    for (; r; ) {
      if (r.isDeactivated)
        return;
      r = r.parent;
    }
    return e();
  });
  if (ms(t, n, s), s) {
    let r = s.parent;
    for (; r && r.parent; )
      cn(r.parent.vnode) && ol(n, t, s, r), r = r.parent;
  }
}
function ol(e, t, s, n) {
  const r = ms(
    t,
    e,
    n,
    !0
    /* prepend */
  );
  fn(() => {
    Gs(n[t], r);
  }, s);
}
function ms(e, t, s = ie, n = !1) {
  if (s) {
    const r = s[e] || (s[e] = []), i = t.__weh || (t.__weh = (...l) => {
      $e();
      const o = Nt(s), f = Se(t, s, e, l);
      return o(), Fe(), f;
    });
    return n ? r.unshift(i) : r.push(i), i;
  }
}
const Ue = (e) => (t, s = ie) => {
  (!$t || e === "sp") && ms(e, (...n) => t(...n), s);
}, cl = Ue("bm"), kr = Ue("m"), fl = Ue(
  "bu"
), al = Ue("u"), ul = Ue(
  "bum"
), fn = Ue("um"), dl = Ue(
  "sp"
), hl = Ue("rtg"), gl = Ue("rtc");
function pl(e, t = ie) {
  ms("ec", e, t);
}
const ml = "components", $r = /* @__PURE__ */ Symbol.for("v-ndc");
function bl(e) {
  return X(e) ? yl(ml, e, !1) || e : e || $r;
}
function yl(e, t, s = !0, n = !1) {
  const r = ae || ie;
  if (r) {
    const i = r.type;
    {
      const o = so(
        i,
        !1
      );
      if (o && (o === t || o === ue(t) || o === as(ue(t))))
        return i;
    }
    const l = (
      // local registration
      // check instance[type] first which is resolved for options API
      In(r[e] || i[e], t) || // global registration
      In(r.appContext[e], t)
    );
    return !l && n ? i : l;
  }
}
function In(e, t) {
  return e && (e[t] || e[ue(t)] || e[as(ue(t))]);
}
function As(e, t, s, n) {
  let r;
  const i = s, l = I(e);
  if (l || X(e)) {
    const o = l && /* @__PURE__ */ Ge(e);
    let f = !1, d = !1;
    o && (f = !/* @__PURE__ */ me(e), d = /* @__PURE__ */ je(e), e = hs(e)), r = new Array(e.length);
    for (let a = 0, h = e.length; a < h; a++)
      r[a] = t(
        f ? d ? Je(be(e[a])) : be(e[a]) : e[a],
        a,
        void 0,
        i
      );
  } else if (typeof e == "number")
    if (!Number.isInteger(e) || e < 0)
      r = [];
    else {
      r = new Array(e);
      for (let o = 0; o < e; o++)
        r[o] = t(o + 1, o, void 0, i);
    }
  else if (B(e))
    if (e[Symbol.iterator])
      r = Array.from(
        e,
        (o, f) => t(o, f, void 0, i)
      );
    else {
      const o = Object.keys(e);
      r = new Array(o.length);
      for (let f = 0, d = o.length; f < d; f++) {
        const a = o[f];
        r[f] = t(e[a], a, f, i);
      }
    }
  else
    r = [];
  return r;
}
function _l(e, t, s, n, r, i) {
  if (s == null && (s = {}), ae.ce || ae.parent && ut(ae.parent) && ae.parent.ce) {
    const d = s, a = Object.keys(d).length > 0;
    return N(), rt(
      se,
      null,
      [he("slot", d, n)],
      a ? -2 : 64
    );
  }
  let l = e[t];
  l && l._c && (l._d = !1);
  const o = Be.length;
  N();
  let f;
  try {
    const d = l && Fr(l(s)), a = s.key || i || // slot content array of a dynamic conditional slot may have a branch
    // key attached in the `createSlots` helper, respect that
    d && d.key;
    f = rt(
      se,
      {
        key: (a && !we(a) ? a : `_${t}`) + // #7256 force differentiate fallback content from actual content
        (!d && n ? "_fb" : "")
      },
      d || (n ? n() : []),
      d && e._ === 1 ? 64 : -2
    );
  } catch (d) {
    for (let a = Be.length; a > o; a--) dn();
    throw d;
  } finally {
    l && l._c && (l._d = !0);
  }
  return f.scopeId && (f.slotScopeIds = [f.scopeId + "-s"]), f;
}
function Fr(e) {
  return e.some((t) => ht(t) ? !(t.type === ye || t.type === se && !Fr(t.children)) : !0) ? e : null;
}
const Ls = (e) => e ? ni(e) ? hn(e) : Ls(e.parent) : null, At = (
  // Move PURE marker to new line to workaround compiler discarding it
  // due to type annotation
  /* @__PURE__ */ ne(/* @__PURE__ */ Object.create(null), {
    $: (e) => e,
    $el: (e) => e.vnode.el,
    $data: (e) => e.data,
    $props: (e) => e.props,
    $attrs: (e) => e.attrs,
    $slots: (e) => e.slots,
    $refs: (e) => e.refs,
    $parent: (e) => Ls(e.parent),
    $root: (e) => Ls(e.root),
    $host: (e) => e.ce,
    $emit: (e) => e.emit,
    $options: (e) => Nr(e),
    $forceUpdate: (e) => e.f || (e.f = () => {
      ln(e.update);
    }),
    $nextTick: (e) => e.n || (e.n = Ji.bind(e.proxy)),
    $watch: (e) => sl.bind(e)
  })
), Ps = (e, t) => e !== z && !e.__isScriptSetup && D(e, t), xl = {
  get({ _: e }, t) {
    if (t === "__v_skip")
      return !0;
    const { ctx: s, setupState: n, data: r, props: i, accessCache: l, type: o, appContext: f } = e;
    if (t[0] !== "$") {
      const p = l[t];
      if (p !== void 0)
        switch (p) {
          case 1:
            return n[t];
          case 2:
            return r[t];
          case 4:
            return s[t];
          case 3:
            return i[t];
        }
      else {
        if (Ps(n, t))
          return l[t] = 1, n[t];
        if (r !== z && D(r, t))
          return l[t] = 2, r[t];
        if (D(i, t))
          return l[t] = 3, i[t];
        if (s !== z && D(s, t))
          return l[t] = 4, s[t];
        Bs && (l[t] = 0);
      }
    }
    const d = At[t];
    let a, h;
    if (d)
      return t === "$attrs" && re(e.attrs, "get", ""), d(e);
    if (
      // css module (injected by vue-loader)
      (a = o.__cssModules) && (a = a[t])
    )
      return a;
    if (s !== z && D(s, t))
      return l[t] = 4, s[t];
    if (
      // global properties
      h = f.config.globalProperties, D(h, t)
    )
      return h[t];
  },
  set({ _: e }, t, s) {
    const { data: n, setupState: r, ctx: i } = e;
    return Ps(r, t) ? (r[t] = s, !0) : n !== z && D(n, t) ? (n[t] = s, !0) : D(e.props, t) || t[0] === "$" && t.slice(1) in e ? !1 : (i[t] = s, !0);
  },
  has({
    _: { data: e, setupState: t, accessCache: s, ctx: n, appContext: r, props: i, type: l }
  }, o) {
    let f;
    return !!(s[o] || e !== z && o[0] !== "$" && D(e, o) || Ps(t, o) || D(i, o) || D(n, o) || D(At, o) || D(r.config.globalProperties, o) || (f = l.__cssModules) && f[o]);
  },
  defineProperty(e, t, s) {
    return s.get != null ? e._.accessCache[t] = 0 : D(s, "value") && this.set(e, t, s.value, null), Reflect.defineProperty(e, t, s);
  }
};
function Mn(e) {
  return I(e) ? e.reduce(
    (t, s) => (t[s] = null, t),
    {}
  ) : e;
}
let Bs = !0;
function vl(e) {
  const t = Nr(e), s = e.proxy, n = e.ctx;
  Bs = !1, t.beforeCreate && Rn(t.beforeCreate, e, "bc");
  const {
    // state
    data: r,
    computed: i,
    methods: l,
    watch: o,
    provide: f,
    inject: d,
    // lifecycle
    created: a,
    beforeMount: h,
    mounted: p,
    beforeUpdate: T,
    updated: F,
    activated: M,
    deactivated: J,
    beforeDestroy: $,
    beforeUnmount: E,
    destroyed: P,
    unmounted: A,
    render: Q,
    renderTracked: Ke,
    renderTriggered: Te,
    errorCaptured: Ve,
    serverPrefetch: Dt,
    // public API
    expose: Ye,
    inheritAttrs: pt,
    // assets
    components: Ht,
    directives: Lt,
    filters: _s
  } = t;
  if (d && wl(d, n, null), l)
    for (const Y in l) {
      const V = l[Y];
      k(V) && (n[Y] = V.bind(s));
    }
  if (r) {
    const Y = r.call(s, s);
    B(Y) && (e.data = /* @__PURE__ */ sn(Y));
  }
  if (Bs = !0, i)
    for (const Y in i) {
      const V = i[Y], Xe = k(V) ? V.bind(s, s) : k(V.get) ? V.get.bind(s, s) : ke, Bt = !k(V) && k(V.set) ? V.set.bind(s) : ke, Ze = ft({
        get: Xe,
        set: Bt
      });
      Object.defineProperty(n, Y, {
        enumerable: !0,
        configurable: !0,
        get: () => Ze.value,
        set: (_e) => Ze.value = _e
      });
    }
  if (o)
    for (const Y in o)
      jr(o[Y], n, s, Y);
  if (f) {
    const Y = k(f) ? f.call(s) : f;
    Reflect.ownKeys(Y).forEach((V) => {
      Qi(V, Y[V]);
    });
  }
  a && Rn(a, e, "c");
  function oe(Y, V) {
    I(V) ? V.forEach((Xe) => Y(Xe.bind(s))) : V && Y(V.bind(s));
  }
  if (oe(cl, h), oe(kr, p), oe(fl, T), oe(al, F), oe(il, M), oe(ll, J), oe(pl, Ve), oe(gl, Ke), oe(hl, Te), oe(ul, E), oe(fn, A), oe(dl, Dt), I(Ye))
    if (Ye.length) {
      const Y = e.exposed || (e.exposed = {});
      Ye.forEach((V) => {
        Object.defineProperty(Y, V, {
          get: () => s[V],
          set: (Xe) => s[V] = Xe,
          enumerable: !0
        });
      });
    } else e.exposed || (e.exposed = {});
  Q && e.render === ke && (e.render = Q), pt != null && (e.inheritAttrs = pt), Ht && (e.components = Ht), Lt && (e.directives = Lt), Dt && Mr(e);
}
function wl(e, t, s = ke) {
  I(e) && (e = Us(e));
  for (const n in e) {
    const r = e[n];
    let i;
    B(r) ? "default" in r ? i = zt(
      r.from || n,
      r.default,
      !0
    ) : i = zt(r.from || n) : i = zt(r), /* @__PURE__ */ le(i) ? Object.defineProperty(t, n, {
      enumerable: !0,
      configurable: !0,
      get: () => i.value,
      set: (l) => i.value = l
    }) : t[n] = i;
  }
}
function Rn(e, t, s) {
  Se(
    I(e) ? e.map((n) => n.bind(t.proxy)) : e.bind(t.proxy),
    t,
    s
  );
}
function jr(e, t, s, n) {
  let r = n.includes(".") ? Pr(s, n) : () => s[n];
  if (X(e)) {
    const i = t[e];
    k(i) && Gt(r, i);
  } else if (k(e))
    Gt(r, e.bind(s));
  else if (B(e))
    if (I(e))
      e.forEach((i) => jr(i, t, s, n));
    else {
      const i = k(e.handler) ? e.handler.bind(s) : t[e.handler];
      k(i) && Gt(r, i, e);
    }
}
function Nr(e) {
  const t = e.type, { mixins: s, extends: n } = t, {
    mixins: r,
    optionsCache: i,
    config: { optionMergeStrategies: l }
  } = e.appContext, o = i.get(t);
  let f;
  return o ? f = o : !r.length && !s && !n ? f = t : (f = {}, r.length && r.forEach(
    (d) => ns(f, d, l, !0)
  ), ns(f, t, l)), B(t) && i.set(t, f), f;
}
function ns(e, t, s, n = !1) {
  const { mixins: r, extends: i } = t;
  i && ns(e, i, s, !0), r && r.forEach(
    (l) => ns(e, l, s, !0)
  );
  for (const l in t)
    if (!(n && l === "expose")) {
      const o = Sl[l] || s && s[l];
      e[l] = o ? o(e[l], t[l]) : t[l];
    }
  return e;
}
const Sl = {
  data: kn,
  props: $n,
  emits: $n,
  // objects
  methods: wt,
  computed: wt,
  // lifecycle
  beforeCreate: ce,
  created: ce,
  beforeMount: ce,
  mounted: ce,
  beforeUpdate: ce,
  updated: ce,
  beforeDestroy: ce,
  beforeUnmount: ce,
  destroyed: ce,
  unmounted: ce,
  activated: ce,
  deactivated: ce,
  errorCaptured: ce,
  serverPrefetch: ce,
  // assets
  components: wt,
  directives: wt,
  // watch
  watch: Cl,
  // provide / inject
  provide: kn,
  inject: Tl
};
function kn(e, t) {
  return t ? e ? function() {
    return ne(
      k(e) ? e.call(this, this) : e,
      k(t) ? t.call(this, this) : t
    );
  } : t : e;
}
function Tl(e, t) {
  return wt(Us(e), Us(t));
}
function Us(e) {
  if (I(e)) {
    const t = {};
    for (let s = 0; s < e.length; s++)
      t[e[s]] = e[s];
    return t;
  }
  return e;
}
function ce(e, t) {
  return e ? [...new Set([].concat(e, t))] : t;
}
function wt(e, t) {
  return e ? ne(/* @__PURE__ */ Object.create(null), e, t) : t;
}
function $n(e, t) {
  return e ? I(e) && I(t) ? [.../* @__PURE__ */ new Set([...e, ...t])] : ne(
    /* @__PURE__ */ Object.create(null),
    Mn(e),
    Mn(t ?? {})
  ) : t;
}
function Cl(e, t) {
  if (!e) return t;
  if (!t) return e;
  const s = ne(/* @__PURE__ */ Object.create(null), e);
  for (const n in t)
    s[n] = ce(e[n], t[n]);
  return s;
}
function Dr() {
  return {
    app: null,
    config: {
      isNativeTag: Zn,
      performance: !1,
      globalProperties: {},
      optionMergeStrategies: {},
      errorHandler: void 0,
      warnHandler: void 0,
      compilerOptions: {}
    },
    mixins: [],
    components: {},
    directives: {},
    provides: /* @__PURE__ */ Object.create(null),
    optionsCache: /* @__PURE__ */ new WeakMap(),
    propsCache: /* @__PURE__ */ new WeakMap(),
    emitsCache: /* @__PURE__ */ new WeakMap()
  };
}
let El = 0;
function Ol(e, t) {
  return function(n, r = null) {
    k(n) || (n = ne({}, n)), r != null && !B(r) && (r = null);
    const i = Dr(), l = /* @__PURE__ */ new WeakSet(), o = [];
    let f = !1;
    const d = i.app = {
      _uid: El++,
      _component: n,
      _props: r,
      _container: null,
      _context: i,
      _instance: null,
      version: io,
      get config() {
        return i.config;
      },
      set config(a) {
      },
      use(a, ...h) {
        return l.has(a) || (a && k(a.install) ? (l.add(a), a.install(d, ...h)) : k(a) && (l.add(a), a(d, ...h))), d;
      },
      mixin(a) {
        return i.mixins.includes(a) || i.mixins.push(a), d;
      },
      component(a, h) {
        return h ? (i.components[a] = h, d) : i.components[a];
      },
      directive(a, h) {
        return h ? (i.directives[a] = h, d) : i.directives[a];
      },
      mount(a, h, p) {
        if (!f) {
          const T = d._ceVNode || he(n, r);
          return T.appContext = i, p === !0 ? p = "svg" : p === !1 && (p = void 0), e(T, a, p), f = !0, d._container = a, a.__vue_app__ = d, hn(T.component);
        }
      },
      onUnmount(a) {
        o.push(a);
      },
      unmount() {
        f && (Se(
          o,
          d._instance,
          16
        ), e(null, d._container), delete d._container.__vue_app__);
      },
      provide(a, h) {
        return i.provides[a] = h, d;
      },
      runWithContext(a) {
        const h = dt;
        dt = d;
        try {
          return a();
        } finally {
          dt = h;
        }
      }
    };
    return d;
  };
}
let dt = null;
const Al = (e, t) => t === "modelValue" || t === "model-value" ? e.modelModifiers : e[`${t}Modifiers`] || e[`${ue(t)}Modifiers`] || e[`${it(t)}Modifiers`];
function Pl(e, t, ...s) {
  if (e.isUnmounted) return;
  const n = e.vnode.props || z;
  let r = s;
  const i = t.startsWith("update:"), l = i && Al(n, t.slice(7));
  l && (l.trim && (r = s.map((a) => X(a) ? a.trim() : a)), l.number && (r = r.map(ui)));
  let o, f = n[o = xs(t)] || // also try camelCase event handler (#2249)
  n[o = xs(ue(t))];
  !f && i && (f = n[o = xs(it(t))]), f && Se(
    f,
    e,
    6,
    r
  );
  const d = n[o + "Once"];
  if (d) {
    if (!e.emitted)
      e.emitted = {};
    else if (e.emitted[o])
      return;
    e.emitted[o] = !0, Se(
      d,
      e,
      6,
      r
    );
  }
}
const Il = /* @__PURE__ */ new WeakMap();
function Hr(e, t, s = !1) {
  const n = s ? Il : t.emitsCache, r = n.get(e);
  if (r !== void 0)
    return r;
  const i = e.emits;
  let l = {}, o = !1;
  if (!k(e)) {
    const f = (d) => {
      const a = Hr(d, t, !0);
      a && (o = !0, ne(l, a));
    };
    !s && t.mixins.length && t.mixins.forEach(f), e.extends && f(e.extends), e.mixins && e.mixins.forEach(f);
  }
  return !i && !o ? (B(e) && n.set(e, null), null) : (I(i) ? i.forEach((f) => l[f] = null) : ne(l, i), B(e) && n.set(e, l), l);
}
function bs(e, t) {
  return !e || !os(t) ? !1 : (t = t.slice(2), t = t === "Once" ? t : t.replace(/Once$/, ""), D(e, t[0].toLowerCase() + t.slice(1)) || D(e, it(t)) || D(e, t));
}
function Fn(e) {
  const {
    type: t,
    vnode: s,
    proxy: n,
    withProxy: r,
    propsOptions: [i],
    slots: l,
    attrs: o,
    emit: f,
    render: d,
    renderCache: a,
    props: h,
    data: p,
    setupState: T,
    ctx: F,
    inheritAttrs: M
  } = e, J = Qt(e);
  let $, E;
  try {
    if (s.shapeFlag & 4) {
      const A = r || n, Q = A;
      $ = Me(
        d.call(
          Q,
          A,
          a,
          h,
          T,
          p,
          F
        )
      ), E = o;
    } else {
      const A = t;
      $ = Me(
        A.length > 1 ? A(
          h,
          { attrs: o, slots: l, emit: f }
        ) : A(
          h,
          null
        )
      ), E = t.props ? o : Ml(o);
    }
  } catch (A) {
    Be.length = 0, gs(A, e, 1), $ = he(ye);
  }
  let P = $;
  if (E && M !== !1) {
    const A = Object.keys(E), { shapeFlag: Q } = P;
    A.length && Q & 7 && (i && A.some(cs) && (E = Rl(
      E,
      i
    )), P = gt(P, E, !1, !0));
  }
  if (s.dirs && (P = gt(P, null, !1, !0), P.dirs = P.dirs ? P.dirs.concat(s.dirs) : s.dirs), s.transition) {
    const A = ps(P.type) && Ir(P) || P;
    ts(A, s.transition);
  }
  return $ = P, Qt(J), $;
}
function Lr(e, t = !0) {
  let s;
  for (let n = 0; n < e.length; n++) {
    const r = e[n];
    if (ht(r)) {
      if (r.type !== ye || r.children === "v-if") {
        if (s)
          return;
        s = r;
      }
    } else
      return;
  }
  return s;
}
const Ml = (e) => {
  let t;
  for (const s in e)
    (s === "class" || s === "style" || os(s)) && ((t || (t = {}))[s] = e[s]);
  return t;
}, Rl = (e, t) => {
  const s = {};
  for (const n in e)
    (!cs(n) || !(n.slice(9) in t)) && (s[n] = e[n]);
  return s;
};
function kl(e, t, s) {
  const { props: n, children: r, component: i } = e, { props: l, children: o, patchFlag: f } = t, d = i.emitsOptions;
  if (t.dirs || t.transition)
    return !0;
  if (s && f >= 0) {
    if (f & 1024)
      return !0;
    if (f & 16)
      return n ? jn(n, l, d) : !!l;
    if (f & 8) {
      const a = t.dynamicProps;
      for (let h = 0; h < a.length; h++) {
        const p = a[h];
        if (Br(l, n, p) && !bs(d, p))
          return !0;
      }
    }
  } else
    return (r || o) && (!o || !o.$stable) ? !0 : n === l ? !1 : n ? l ? jn(n, l, d) : !0 : !!l;
  return !1;
}
function jn(e, t, s) {
  const n = Object.keys(t);
  if (n.length !== Object.keys(e).length)
    return !0;
  for (let r = 0; r < n.length; r++) {
    const i = n[r];
    if (!D(e, i) || Br(t, e, i) && !bs(s, i))
      return !0;
  }
  return !1;
}
function Br(e, t, s) {
  const n = e[s], r = t[s];
  return s === "style" && B(n) && B(r) ? !ds(n, r) : n !== r;
}
function $l({ vnode: e, parent: t, suspense: s }, n) {
  for (; t; ) {
    const r = t.subTree;
    if (r.suspense && r.suspense.activeBranch === e && (r.suspense.vnode.el = r.el = n, e = r), r === e)
      (e = t.vnode).el = n, t = t.parent;
    else
      break;
  }
  s && s.activeBranch === e && (s.vnode.el = n);
}
const Ur = {}, Kr = () => Object.create(Ur), Vr = (e) => Object.getPrototypeOf(e) === Ur;
function Fl(e, t, s, n = !1) {
  const r = {}, i = Kr();
  e.propsDefaults = /* @__PURE__ */ Object.create(null), Wr(e, t, r, i);
  for (const l in e.propsOptions[0])
    l in r || (r[l] = void 0);
  s ? e.props = n ? r : /* @__PURE__ */ Di(r) : e.type.props ? e.props = r : e.props = i, e.attrs = i;
}
function jl(e, t, s, n) {
  const {
    props: r,
    attrs: i,
    vnode: { patchFlag: l }
  } = e, o = /* @__PURE__ */ L(r), [f] = e.propsOptions;
  let d = !1;
  if (
    // always force full diff in dev
    // - #1942 if hmr is enabled with sfc component
    // - vite#872 non-sfc component used by sfc component
    (n || l > 0) && !(l & 16)
  ) {
    if (l & 8) {
      const a = e.vnode.dynamicProps;
      for (let h = 0; h < a.length; h++) {
        let p = a[h];
        if (bs(e.emitsOptions, p))
          continue;
        const T = t[p];
        if (f)
          if (D(i, p))
            T !== i[p] && (i[p] = T, d = !0);
          else {
            const F = ue(p);
            r[F] = Ks(
              f,
              o,
              F,
              T,
              e,
              !1
            );
          }
        else
          T !== i[p] && (i[p] = T, d = !0);
      }
    }
  } else {
    Wr(e, t, r, i) && (d = !0);
    let a;
    for (const h in o)
      (!t || // for camelCase
      !D(t, h) && // it's possible the original props was passed in as kebab-case
      // and converted to camelCase (#955)
      ((a = it(h)) === h || !D(t, a))) && (f ? s && // for camelCase
      (s[h] !== void 0 || // for kebab-case
      s[a] !== void 0) && (r[h] = Ks(
        f,
        o,
        h,
        void 0,
        e,
        !0
      )) : delete r[h]);
    if (i !== o)
      for (const h in i)
        (!t || !D(t, h)) && (delete i[h], d = !0);
  }
  d && Le(e.attrs, "set", "");
}
function Wr(e, t, s, n) {
  const [r, i] = e.propsOptions;
  let l = !1, o;
  if (t)
    for (let f in t) {
      if (Tt(f))
        continue;
      const d = t[f];
      let a;
      r && D(r, a = ue(f)) ? !i || !i.includes(a) ? s[a] = d : (o || (o = {}))[a] = d : bs(e.emitsOptions, f) || (!(f in n) || d !== n[f]) && (n[f] = d, l = !0);
    }
  if (i) {
    const f = /* @__PURE__ */ L(s), d = o || z;
    for (let a = 0; a < i.length; a++) {
      const h = i[a];
      s[h] = Ks(
        r,
        f,
        h,
        d[h],
        e,
        !D(d, h)
      );
    }
  }
  return l;
}
function Ks(e, t, s, n, r, i) {
  const l = e[s];
  if (l != null) {
    const o = D(l, "default");
    if (o && n === void 0) {
      const f = l.default;
      if (l.type !== Function && !l.skipFactory && k(f)) {
        const { propsDefaults: d } = r;
        if (s in d)
          n = d[s];
        else {
          const a = Nt(r);
          n = d[s] = f.call(
            null,
            t
          ), a();
        }
      } else
        n = f;
      r.ce && r.ce._setProp(s, n);
    }
    l[
      0
      /* shouldCast */
    ] && (i && !o ? n = !1 : l[
      1
      /* shouldCastTrue */
    ] && (n === "" || n === it(s)) && (n = !0));
  }
  return n;
}
const Nl = /* @__PURE__ */ new WeakMap();
function qr(e, t, s = !1) {
  const n = s ? Nl : t.propsCache, r = n.get(e);
  if (r)
    return r;
  const i = e.props, l = {}, o = [];
  let f = !1;
  if (!k(e)) {
    const a = (h) => {
      f = !0;
      const [p, T] = qr(h, t, !0);
      ne(l, p), T && o.push(...T);
    };
    !s && t.mixins.length && t.mixins.forEach(a), e.extends && a(e.extends), e.mixins && e.mixins.forEach(a);
  }
  if (!i && !f)
    return B(e) && n.set(e, st), st;
  if (I(i))
    for (let a = 0; a < i.length; a++) {
      const h = ue(i[a]);
      Nn(h) && (l[h] = z);
    }
  else if (i)
    for (const a in i) {
      const h = ue(a);
      if (Nn(h)) {
        const p = i[a], T = l[h] = I(p) || k(p) ? { type: p } : ne({}, p), F = T.type;
        let M = !1, J = !0;
        if (I(F))
          for (let $ = 0; $ < F.length; ++$) {
            const E = F[$], P = k(E) && E.name;
            if (P === "Boolean") {
              M = !0;
              break;
            } else P === "String" && (J = !1);
          }
        else
          M = k(F) && F.name === "Boolean";
        T[
          0
          /* shouldCast */
        ] = M, T[
          1
          /* shouldCastTrue */
        ] = J, (M || D(T, "default")) && o.push(h);
      }
    }
  const d = [l, o];
  return B(e) && n.set(e, d), d;
}
function Nn(e) {
  return e[0] !== "$" && !Tt(e);
}
const an = (e) => e === "_" || e === "_ctx" || e === "$stable", un = (e) => I(e) ? e.map(Me) : [Me(e)], Dl = (e, t, s) => {
  if (t._n)
    return t;
  const n = es((...r) => un(t(...r)), s);
  return n._c = !1, n;
}, zr = (e, t, s) => {
  const n = e._ctx;
  for (const r in e) {
    if (an(r)) continue;
    const i = e[r];
    if (k(i))
      t[r] = Dl(r, i, n);
    else if (i != null) {
      const l = un(i);
      t[r] = () => l;
    }
  }
}, Gr = (e, t) => {
  const s = un(t);
  e.slots.default = () => s;
}, Jr = (e, t, s) => {
  for (const n in t)
    (s || !an(n)) && (e[n] = t[n]);
}, Hl = (e, t, s) => {
  const n = e.slots = Kr();
  if (e.vnode.shapeFlag & 32) {
    const r = t._;
    r ? (Jr(n, t, s), s && sr(n, "_", r, !0)) : zr(t, n);
  } else t && Gr(e, t);
}, Ll = (e, t, s) => {
  const { vnode: n, slots: r } = e;
  let i = !0, l = z;
  if (n.shapeFlag & 32) {
    const o = t._;
    o ? s && o === 1 ? i = !1 : Jr(r, t, s) : (i = !t.$stable, zr(t, r)), l = t;
  } else t && (Gr(e, t), l = { default: 1 });
  if (i)
    for (const o in r)
      !an(o) && l[o] == null && delete r[o];
}, de = Wl;
function Bl(e) {
  return Ul(e);
}
function Ul(e, t) {
  const s = us();
  s.__VUE__ = !0;
  const {
    insert: n,
    remove: r,
    patchProp: i,
    createElement: l,
    createText: o,
    createComment: f,
    setText: d,
    setElementText: a,
    parentNode: h,
    nextSibling: p,
    setScopeId: T = ke,
    insertStaticContent: F
  } = e, M = (c, u, g, _ = null, b = null, y = null, w = void 0, v = null, x = !!u.dynamicChildren) => {
    if (c === u)
      return;
    c && !xt(c, u) && (_ = Ut(c), _e(c, b, y, !0), c = null), u.patchFlag === -2 && (x = !1, u.dynamicChildren = null), u.dynamicChildren && c && c.dynamicChildren && c.dynamicChildren.hasOnce && (u.dynamicChildren === st && (u.dynamicChildren = []), u.dynamicChildren.hasOnce = !0);
    const { type: m, ref: C, shapeFlag: S } = u;
    switch (m) {
      case ys:
        J(c, u, g, _);
        break;
      case ye:
        $(c, u, g, _);
        break;
      case Ms:
        c == null && E(u, g, _, w);
        break;
      case se:
        Ht(
          c,
          u,
          g,
          _,
          b,
          y,
          w,
          v,
          x
        );
        break;
      default:
        S & 1 ? Q(
          c,
          u,
          g,
          _,
          b,
          y,
          w,
          v,
          x
        ) : S & 6 ? Lt(
          c,
          u,
          g,
          _,
          b,
          y,
          w,
          v,
          x
        ) : (S & 64 || S & 128) && m.process(
          c,
          u,
          g,
          _,
          b,
          y,
          w,
          v,
          x,
          bt
        );
    }
    C != null && b ? Ot(C, c && c.ref, y, u || c, !u) : C == null && c && c.ref != null && Ot(c.ref, null, y, c, !0);
  }, J = (c, u, g, _) => {
    if (c == null)
      n(
        u.el = o(u.children),
        g,
        _
      );
    else {
      const b = u.el = c.el;
      u.children !== c.children && d(b, u.children);
    }
  }, $ = (c, u, g, _) => {
    c == null ? n(
      u.el = f(u.children || ""),
      g,
      _
    ) : u.el = c.el;
  }, E = (c, u, g, _) => {
    [c.el, c.anchor] = F(
      c.children,
      u,
      g,
      _,
      c.el,
      c.anchor
    );
  }, P = ({ el: c, anchor: u }, g, _) => {
    let b;
    for (; c && c !== u; )
      b = p(c), n(c, g, _), c = b;
    n(u, g, _);
  }, A = ({ el: c, anchor: u }) => {
    let g;
    for (; c && c !== u; )
      g = p(c), r(c), c = g;
    r(u);
  }, Q = (c, u, g, _, b, y, w, v, x) => {
    if (u.type === "svg" ? w = "svg" : u.type === "math" && (w = "mathml"), c == null)
      Ke(
        u,
        g,
        _,
        b,
        y,
        w,
        v,
        x
      );
    else {
      const m = c.el && c.el._isVueCE ? c.el : null;
      try {
        m && m._beginPatch(), Dt(
          c,
          u,
          b,
          y,
          w,
          v,
          x
        );
      } finally {
        m && m._endPatch();
      }
    }
  }, Ke = (c, u, g, _, b, y, w, v) => {
    let x, m;
    const { props: C, shapeFlag: S, transition: O, dirs: R } = c;
    if (x = c.el = l(
      c.type,
      y,
      C && C.is,
      C
    ), S & 8 ? a(x, c.children) : S & 16 && Ve(
      c.children,
      x,
      null,
      _,
      b,
      Is(c, y),
      w,
      v
    ), R && Qe(c, null, _, "created"), Te(x, c, c.scopeId, w, _), C) {
      for (const K in C)
        K !== "value" && !Tt(K) && i(x, K, null, C[K], y, _);
      "value" in C && i(x, "value", null, C.value, y), (m = C.onVnodeBeforeMount) && Ae(m, _, c);
    }
    R && Qe(c, null, _, "beforeMount");
    const j = Kl(b, O);
    j && O.beforeEnter(x), n(x, u, g), ((m = C && C.onVnodeMounted) || j || R) && de(() => {
      m && Ae(m, _, c), j && O.enter(x), R && Qe(c, null, _, "mounted");
    }, b);
  }, Te = (c, u, g, _, b) => {
    if (g && T(c, g), _)
      for (let y = 0; y < _.length; y++)
        T(c, _[y]);
    if (b) {
      let y = b.subTree;
      if (u === y || Zr(y.type) && (y.ssContent === u || y.ssFallback === u)) {
        const w = b.vnode;
        Te(
          c,
          w,
          w.scopeId,
          w.slotScopeIds,
          b.parent
        );
      }
    }
  }, Ve = (c, u, g, _, b, y, w, v, x = 0) => {
    for (let m = x; m < c.length; m++) {
      const C = c[m] = v ? He(c[m]) : Me(c[m]);
      M(
        null,
        C,
        u,
        g,
        _,
        b,
        y,
        w,
        v
      );
    }
  }, Dt = (c, u, g, _, b, y, w) => {
    const v = u.el = c.el;
    let { patchFlag: x, dynamicChildren: m, dirs: C } = u;
    x |= c.patchFlag & 16;
    const S = c.props || z, O = u.props || z;
    let R;
    if (g && et(g, !1), (R = O.onVnodeBeforeUpdate) && Ae(R, g, u, c), C && Qe(u, c, g, "beforeUpdate"), g && et(g, !0), // #6385 the old vnode may be a user-wrapped non-isomorphic block
    // Force full diff when block metadata is unstable.
    m && (!c.dynamicChildren || c.dynamicChildren.length !== m.length) && (x = 0, w = !1, m = null), (S.innerHTML && O.innerHTML == null || S.textContent && O.textContent == null) && a(v, ""), m ? Ye(
      c.dynamicChildren,
      m,
      v,
      g,
      _,
      Is(u, b),
      y
    ) : w || V(
      c,
      u,
      v,
      null,
      g,
      _,
      Is(u, b),
      y,
      !1
    ), x > 0) {
      if (x & 16)
        pt(v, S, O, g, b);
      else if (x & 2 && S.class !== O.class && i(v, "class", null, O.class, b), x & 4 && i(v, "style", S.style, O.style, b), x & 8) {
        const j = u.dynamicProps;
        for (let K = 0; K < j.length; K++) {
          const U = j[K], Z = S[U], ee = O[U];
          (ee !== Z || U === "value") && i(v, U, Z, ee, b, g);
        }
      }
      x & 1 && c.children !== u.children && a(v, u.children);
    } else !w && m == null && pt(v, S, O, g, b);
    ((R = O.onVnodeUpdated) || C) && de(() => {
      R && Ae(R, g, u, c), C && Qe(u, c, g, "updated");
    }, _);
  }, Ye = (c, u, g, _, b, y, w) => {
    for (let v = 0; v < u.length; v++) {
      const x = c[v], m = u[v], C = x.el || Vs(x), S = (
        // oldVNode may be an errored async setup() component inside Suspense
        // which will not have a mounted element
        C && // - In the case of a Fragment, we need to provide the actual parent
        // of the Fragment itself so it can move its children.
        (x.type === se || // - In the case of different nodes, there is going to be a replacement
        // which also requires the correct parent container
        !xt(x, m) || // - In the case of a component, it could contain anything.
        x.shapeFlag & 198) ? h(C) : (
          // In other cases, the parent container is not actually used so we
          // just pass the block element here to avoid a DOM parentNode call.
          g
        )
      );
      M(
        x,
        m,
        S,
        null,
        _,
        b,
        y,
        w,
        !0
      );
    }
  }, pt = (c, u, g, _, b) => {
    if (u !== g) {
      if (u !== z)
        for (const y in u)
          !Tt(y) && !(y in g) && i(
            c,
            y,
            u[y],
            null,
            b,
            _
          );
      for (const y in g) {
        if (Tt(y)) continue;
        const w = g[y], v = u[y];
        w !== v && y !== "value" && i(c, y, v, w, b, _);
      }
      "value" in g && i(c, "value", u.value, g.value, b);
    }
  }, Ht = (c, u, g, _, b, y, w, v, x) => {
    const m = u.el = c ? c.el : o(""), C = u.anchor = c ? c.anchor : o("");
    let { patchFlag: S, dynamicChildren: O, slotScopeIds: R } = u;
    R && (v = v ? v.concat(R) : R), c == null ? (n(m, g, _), n(C, g, _), Ve(
      // #10007
      // such fragment like `<></>` will be compiled into
      // a fragment which doesn't have a children.
      // In this case fallback to an empty array
      u.children || [],
      g,
      C,
      b,
      y,
      w,
      v,
      x
    )) : S > 0 && S & 64 && O && // #2715 the previous fragment could've been a BAILed one as a result
    // of renderSlot() with no valid children
    c.dynamicChildren && c.dynamicChildren.length === O.length ? (Ye(
      c.dynamicChildren,
      O,
      g,
      b,
      y,
      w,
      v
    ), // #2080 if the stable fragment has a key, it's a <template v-for> that may
    //  get moved around. Make sure all root level vnodes inherit el.
    // #2134 or if it's a component root, it may also get moved around
    // as the component is being moved.
    (u.key != null || b && u === b.subTree) && Yr(
      c,
      u,
      !0
      /* shallow */
    )) : V(
      c,
      u,
      g,
      C,
      b,
      y,
      w,
      v,
      x
    );
  }, Lt = (c, u, g, _, b, y, w, v, x) => {
    u.slotScopeIds = v, c == null ? u.shapeFlag & 512 ? b.ctx.activate(
      u,
      g,
      _,
      w,
      x
    ) : _s(
      u,
      g,
      _,
      b,
      y,
      w,
      x
    ) : gn(c, u, x);
  }, _s = (c, u, g, _, b, y, w) => {
    const v = c.component = Yl(
      c,
      _,
      b
    );
    if (cn(c) && (v.ctx.renderer = bt), Zl(v, !1, w), v.asyncDep) {
      if (b && b.registerDep(
        v,
        oe,
        w,
        y
      ), !c.el) {
        const x = v.subTree = he(ye);
        $(null, x, u, g), c.placeholder = x.el;
      }
    } else
      oe(
        v,
        c,
        u,
        g,
        b,
        y,
        w
      );
  }, gn = (c, u, g) => {
    const _ = u.component = c.component;
    if (kl(c, u, g))
      if (_.asyncDep && !_.asyncResolved) {
        u.el = c.el, u.placeholder = c.placeholder, Y(_, u, g);
        return;
      } else
        _.next = u, _.update();
    else
      u.el = c.el, u.placeholder = c.placeholder, _.vnode = u;
  }, oe = (c, u, g, _, b, y, w) => {
    const v = () => {
      if (c.isMounted) {
        let { next: S, bu: O, u: R, parent: j, vnode: K } = c;
        {
          const Ee = Xr(c);
          if (Ee) {
            S && (S.el = K.el, Y(c, S, w)), Ee.asyncDep.then(() => {
              de(() => {
                c.isUnmounted || m();
              }, b);
            });
            return;
          }
        }
        let U = S, Z;
        et(c, !1), S ? (S.el = K.el, Y(c, S, w)) : S = K, O && vs(O), (Z = S.props && S.props.onVnodeBeforeUpdate) && Ae(Z, j, S, K), et(c, !0);
        const ee = Fn(c), Ce = c.subTree;
        c.subTree = ee, M(
          Ce,
          ee,
          // parent may have changed if it's in a teleport
          h(Ce.el),
          // anchor may have changed if it's in a fragment
          Ut(Ce),
          c,
          b,
          y
        ), S.el = ee.el, U === null && $l(c, ee.el), R && de(R, b), (Z = S.props && S.props.onVnodeUpdated) && de(
          () => Ae(Z, j, S, K),
          b
        );
      } else {
        let S;
        const { el: O, props: R } = u, { bm: j, m: K, parent: U, root: Z, type: ee } = c, Ce = ut(u);
        et(c, !1), j && vs(j), !Ce && (S = R && R.onVnodeBeforeMount) && Ae(S, U, u), et(c, !0);
        {
          Z.ce && Z.ce._hasShadowRoot() && Z.ce._injectChildStyle(
            ee,
            c.parent ? c.parent.type : void 0
          );
          const Ee = c.subTree = Fn(c);
          M(
            null,
            Ee,
            g,
            _,
            c,
            b,
            y
          ), u.el = Ee.el;
        }
        if (K && de(K, b), !Ce && (S = R && R.onVnodeMounted)) {
          const Ee = u;
          de(
            () => Ae(S, U, Ee),
            b
          );
        }
        (u.shapeFlag & 256 || U && ut(U.vnode) && U.vnode.shapeFlag & 256) && c.a && de(c.a, b), c.isMounted = !0, u = g = _ = null;
      }
    };
    c.scope.on();
    const x = c.effect = new lr(v);
    c.scope.off();
    const m = c.update = x.run.bind(x), C = c.job = x.runIfDirty.bind(x);
    C.i = c, C.id = c.uid, x.scheduler = () => ln(C), et(c, !0), m();
  }, Y = (c, u, g) => {
    u.component = c;
    const _ = c.vnode.props;
    c.vnode = u, c.next = null, jl(c, u.props, _, g), Ll(c, u.children, g), $e(), Tr(c), Fe();
  }, V = (c, u, g, _, b, y, w, v, x = !1) => {
    const m = c && c.children, C = c ? c.shapeFlag : 0, S = u.children, { patchFlag: O, shapeFlag: R } = u;
    if (O > 0) {
      if (O & 128) {
        Bt(
          m,
          S,
          g,
          _,
          b,
          y,
          w,
          v,
          x
        );
        return;
      } else if (O & 256) {
        Xe(
          m,
          S,
          g,
          _,
          b,
          y,
          w,
          v,
          x
        );
        return;
      }
    }
    R & 8 ? (C & 16 && mt(m, b, y), S !== m && a(g, S)) : C & 16 ? R & 16 ? Bt(
      m,
      S,
      g,
      _,
      b,
      y,
      w,
      v,
      x
    ) : mt(m, b, y, !0) : (C & 8 && a(g, ""), R & 16 && Ve(
      S,
      g,
      _,
      b,
      y,
      w,
      v,
      x
    ));
  }, Xe = (c, u, g, _, b, y, w, v, x) => {
    c = c || st, u = u || st;
    const m = c.length, C = u.length, S = Math.min(m, C);
    let O;
    for (O = 0; O < S; O++) {
      const R = u[O] = x ? He(u[O]) : Me(u[O]);
      M(
        c[O],
        R,
        g,
        null,
        b,
        y,
        w,
        v,
        x
      );
    }
    m > C ? mt(
      c,
      b,
      y,
      !0,
      !1,
      S
    ) : Ve(
      u,
      g,
      _,
      b,
      y,
      w,
      v,
      x,
      S
    );
  }, Bt = (c, u, g, _, b, y, w, v, x) => {
    let m = 0;
    const C = u.length;
    let S = c.length - 1, O = C - 1;
    for (; m <= S && m <= O; ) {
      const R = c[m], j = u[m] = x ? He(u[m]) : Me(u[m]);
      if (xt(R, j))
        M(
          R,
          j,
          g,
          null,
          b,
          y,
          w,
          v,
          x
        );
      else
        break;
      m++;
    }
    for (; m <= S && m <= O; ) {
      const R = c[S], j = u[O] = x ? He(u[O]) : Me(u[O]);
      if (xt(R, j))
        M(
          R,
          j,
          g,
          null,
          b,
          y,
          w,
          v,
          x
        );
      else
        break;
      S--, O--;
    }
    if (m > S) {
      if (m <= O) {
        const R = O + 1, j = R < C ? u[R].el : _;
        for (; m <= O; )
          M(
            null,
            u[m] = x ? He(u[m]) : Me(u[m]),
            g,
            j,
            b,
            y,
            w,
            v,
            x
          ), m++;
      }
    } else if (m > O)
      for (; m <= S; )
        _e(c[m], b, y, !0), m++;
    else {
      const R = m, j = m, K = /* @__PURE__ */ new Map();
      for (m = j; m <= O; m++) {
        const ge = u[m] = x ? He(u[m]) : Me(u[m]);
        ge.key != null && K.set(ge.key, m);
      }
      let U, Z = 0;
      const ee = O - j + 1;
      let Ce = !1, Ee = 0;
      const yt = new Array(ee);
      for (m = 0; m < ee; m++) yt[m] = 0;
      for (m = R; m <= S; m++) {
        const ge = c[m];
        if (Z >= ee) {
          _e(ge, b, y, !0);
          continue;
        }
        let Oe;
        if (ge.key != null)
          Oe = K.get(ge.key);
        else
          for (U = j; U <= O; U++)
            if (yt[U - j] === 0 && xt(ge, u[U])) {
              Oe = U;
              break;
            }
        Oe === void 0 ? _e(ge, b, y, !0) : (yt[Oe - j] = m + 1, Oe >= Ee ? Ee = Oe : Ce = !0, M(
          ge,
          u[Oe],
          g,
          null,
          b,
          y,
          w,
          v,
          x
        ), Z++);
      }
      const yn = Ce ? Vl(yt) : st;
      for (U = yn.length - 1, m = ee - 1; m >= 0; m--) {
        const ge = j + m, Oe = u[ge], _n = u[ge + 1], xn = ge + 1 < C ? (
          // #13559, #14173 fallback to el placeholder for unresolved async component
          _n.el || Vs(_n)
        ) : _;
        yt[m] === 0 ? M(
          null,
          Oe,
          g,
          xn,
          b,
          y,
          w,
          v,
          x
        ) : Ce && (U < 0 || m !== yn[U] ? Ze(Oe, g, xn, 2) : U--);
      }
    }
  }, Ze = (c, u, g, _, b = null) => {
    const { el: y, type: w, transition: v, children: x, shapeFlag: m } = c;
    if (m & 6) {
      Ze(c.component.subTree, u, g, _);
      return;
    }
    if (m & 128) {
      c.suspense.move(u, g, _);
      return;
    }
    if (m & 64) {
      w.move(c, u, g, bt);
      return;
    }
    if (w === se) {
      n(y, u, g);
      for (let S = 0; S < x.length; S++)
        Ze(x[S], u, g, _);
      n(c.anchor, u, g);
      return;
    }
    if (w === Ms) {
      P(c, u, g);
      return;
    }
    if (_ !== 2 && m & 1 && v)
      if (_ === 0)
        v.persisted && !y[Os] ? n(y, u, g) : (v.beforeEnter(y), n(y, u, g), de(() => v.enter(y), b));
      else {
        const { leave: S, delayLeave: O, afterLeave: R } = v, j = () => {
          c.ctx.isUnmounted ? r(y) : n(y, u, g);
        }, K = () => {
          const U = y._isLeaving || !!y[Os];
          y._isLeaving && y[Os](
            !0
            /* cancelled */
          ), v.persisted && !U ? j() : S(y, () => {
            j(), R && R();
          });
        };
        O ? O(y, j, K) : K();
      }
    else
      n(y, u, g);
  }, _e = (c, u, g, _ = !1, b = !1) => {
    const {
      type: y,
      props: w,
      ref: v,
      children: x,
      dynamicChildren: m,
      shapeFlag: C,
      patchFlag: S,
      dirs: O,
      cacheIndex: R,
      memo: j
    } = c;
    if ((S === -2 || m && m.hasOnce) && (b = !1), v != null && ($e(), Ot(v, null, g, c, !0), Fe()), R != null && (!c.ctx || c.ctx === u) && (u.renderCache[R] = void 0), C & 256) {
      u.ctx.deactivate(c);
      return;
    }
    const K = C & 1 && O, U = !ut(c);
    let Z;
    if (U && (Z = w && w.onVnodeBeforeUnmount) && Ae(Z, u, c), C & 6)
      li(c.component, g, _);
    else {
      if (C & 128) {
        c.suspense.unmount(g, _);
        return;
      }
      K && Qe(c, null, u, "beforeUnmount"), C & 64 ? c.type.remove(
        c,
        u,
        g,
        bt,
        _
      ) : m && // #5154
      // when v-once is used inside a block, setBlockTracking(-1) marks the
      // parent block with hasOnce: true
      // so that it doesn't take the fast path during unmount - otherwise
      // components nested in v-once are never unmounted.
      !m.hasOnce && // #1153: fast path should not be taken for non-stable (v-for) fragments
      (y !== se || S > 0 && S & 64) ? mt(
        m,
        u,
        g,
        !1,
        !0
      ) : (y === se && S & 384 || !b && C & 16) && mt(x, u, g), _ && pn(c);
    }
    const ee = j != null && R == null;
    (U && (Z = w && w.onVnodeUnmounted) || K || ee) && de(() => {
      Z && Ae(Z, u, c), K && Qe(c, null, u, "unmounted"), ee && (c.el = null);
    }, g);
  }, pn = (c) => {
    const { type: u, el: g, anchor: _, transition: b } = c, y = u === se;
    if (y && !b) {
      mn(g, _);
      return;
    }
    if (u === Ms) {
      A(c), b && !b.persisted && b.afterLeave && b.afterLeave();
      return;
    }
    const w = y ? Hs(c) : c, v = () => {
      y ? h(g) && mn(g, _) : r(g), b && !b.persisted && b.afterLeave && b.afterLeave();
    };
    if (w && w.shapeFlag & 1 && b && !b.persisted) {
      const { leave: x, delayLeave: m } = b, C = w.el, S = () => x(C, v);
      m ? m(C, v, S) : S();
    } else
      v();
  }, mn = (c, u) => {
    let g;
    for (; c !== u; )
      g = p(c), r(c), c = g;
    r(u);
  }, li = (c, u, g) => {
    const { bum: _, scope: b, job: y, subTree: w, um: v, m: x, a: m } = c;
    Dn(x), Dn(m), _ && vs(_), b.stop(), y ? (y.flags |= 8, _e(w, c, u, g)) : c.vnode.el && w && (w.transition = c.vnode.transition, _e(w, c, u, g)), v && de(v, u), de(() => {
      c.isUnmounted = !0;
    }, u);
  }, mt = (c, u, g, _ = !1, b = !1, y = 0) => {
    for (let w = y; w < c.length; w++)
      _e(c[w], u, g, _, b);
  }, Ut = (c) => {
    if (c.shapeFlag & 6)
      return Ut(c.component.subTree);
    if (c.shapeFlag & 128)
      return c.suspense.next();
    const u = p(c.anchor || c.el), g = u && u[nl];
    return g ? p(g) : u;
  }, bn = (c, u, g) => {
    const _ = c && u._vnode ? void 0 : c && c.component ? c.component.uid : Jl();
    Zi(() => {
      c == null ? u._vnode && _e(u._vnode, null, null, !0) : M(
        u._vnode || null,
        c,
        u,
        null,
        null,
        null,
        g
      ), u._vnode = c;
    }, _);
  }, bt = {
    p: M,
    um: _e,
    m: Ze,
    r: pn,
    mt: _s,
    mc: Ve,
    pc: V,
    pbc: Ye,
    n: Ut,
    o: e
  };
  return {
    render: bn,
    hydrate: void 0,
    createApp: Ol(bn)
  };
}
function Is({ type: e, props: t }, s) {
  return s === "svg" && e === "foreignObject" || s === "mathml" && e === "annotation-xml" && t && t.encoding && t.encoding.includes("html") ? void 0 : s;
}
function et({ effect: e, job: t }, s) {
  s ? (e.flags |= 32, t.flags |= 4) : (e.flags &= -33, t.flags &= -5);
}
function Kl(e, t) {
  return (!e || e && !e.pendingBranch) && t && !t.persisted;
}
function Yr(e, t, s = !1) {
  const n = e.children, r = t.children;
  if (I(n) && I(r))
    for (let i = 0; i < n.length; i++) {
      const l = n[i];
      let o = r[i];
      o.shapeFlag & 1 && !o.dynamicChildren && ((o.patchFlag <= 0 || o.patchFlag === 32) && (o = r[i] = He(r[i]), o.el = l.el), !s && o.patchFlag !== -2 && Yr(l, o)), o.type === ys && (o.patchFlag === -1 && (o = r[i] = He(o)), o.el = l.el), o.type === ye && !o.el && (o.el = l.el);
    }
}
function Vl(e) {
  const t = e.slice(), s = [0];
  let n, r, i, l, o;
  const f = e.length;
  for (n = 0; n < f; n++) {
    const d = e[n];
    if (d !== 0) {
      if (r = s[s.length - 1], e[r] < d) {
        t[n] = r, s.push(n);
        continue;
      }
      for (i = 0, l = s.length - 1; i < l; )
        o = i + l >> 1, e[s[o]] < d ? i = o + 1 : l = o;
      d < e[s[i]] && (i > 0 && (t[n] = s[i - 1]), s[i] = n);
    }
  }
  for (i = s.length, l = s[i - 1]; i-- > 0; )
    s[i] = l, l = t[l];
  return s;
}
function Xr(e) {
  const t = e.subTree.component;
  if (t)
    return t.asyncDep && !t.asyncResolved ? t : Xr(t);
}
function Dn(e) {
  if (e)
    for (let t = 0; t < e.length; t++)
      e[t].flags |= 8;
}
function Vs(e) {
  if (e.placeholder)
    return e.placeholder;
  const t = e.component;
  return t ? Vs(t.subTree) : null;
}
const Zr = (e) => e.__isSuspense;
function Wl(e, t) {
  t && t.pendingBranch ? I(e) ? t.effects.push(...e) : t.effects.push(e) : Xi(e);
}
const se = /* @__PURE__ */ Symbol.for("v-fgt"), ys = /* @__PURE__ */ Symbol.for("v-txt"), ye = /* @__PURE__ */ Symbol.for("v-cmt"), Ms = /* @__PURE__ */ Symbol.for("v-stc"), Be = [];
let pe = null;
function N(e = !1) {
  Be.push(pe = e ? null : []);
}
function dn() {
  Be.pop(), pe = Be[Be.length - 1] || null;
}
let Rt = 1;
function rs(e, t = !1) {
  Rt += e, e < 0 && pe && t && (pe.hasOnce = !0);
}
function Qr(e) {
  return e.dynamicChildren = Rt > 0 ? pe || st : null, dn(), Rt > 0 && pe && pe.push(e), e;
}
function G(e, t, s, n, r, i) {
  return Qr(
    H(
      e,
      t,
      s,
      n,
      r,
      i,
      !0
    )
  );
}
function rt(e, t, s, n, r) {
  return Qr(
    he(
      e,
      t,
      s,
      n,
      r,
      !0
    )
  );
}
function ht(e) {
  return e ? e.__v_isVNode === !0 : !1;
}
function xt(e, t) {
  return e.type === t.type && e.key === t.key;
}
const ei = ({ key: e }) => e ?? null, Jt = ({
  ref: e,
  ref_key: t,
  ref_for: s
}) => (typeof e == "number" && (e = "" + e), e != null ? X(e) || /* @__PURE__ */ le(e) || k(e) ? { i: ae, r: e, k: t, f: !!s } : e : null);
function H(e, t = null, s = null, n = 0, r = null, i = e === se ? 0 : 1, l = !1, o = !1) {
  const f = {
    __v_isVNode: !0,
    __v_skip: !0,
    type: e,
    props: t,
    key: t && ei(t),
    ref: t && Jt(t),
    scopeId: Or,
    slotScopeIds: null,
    children: s,
    component: null,
    suspense: null,
    ssContent: null,
    ssFallback: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetStart: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag: i,
    patchFlag: n,
    dynamicProps: r,
    dynamicChildren: null,
    appContext: null,
    ctx: ae
  };
  return o ? (is(f, s), i & 128 && e.normalize(f)) : s && (f.shapeFlag |= X(s) ? 8 : 16), Rt > 0 && // avoid a block node from tracking itself
  !l && // has current parent block
  pe && // presence of a patch flag indicates this node needs patching on updates.
  // component nodes also should always be patched, because even if the
  // component doesn't need to update, it needs to persist the instance on to
  // the next vnode so that it can be properly unmounted later.
  (f.patchFlag > 0 || i & 6) && // the EVENTS flag is only for hydration and if it is the only flag, the
  // vnode should not be considered dynamic due to handler caching.
  f.patchFlag !== 32 && pe.push(f), f;
}
const he = ql;
function ql(e, t = null, s = null, n = 0, r = null, i = !1) {
  if ((!e || e === $r) && (e = ye), ht(e)) {
    const o = gt(
      e,
      t,
      !0
      /* mergeRef: true */
    );
    return s && is(o, s), Rt > 0 && !i && pe && (o.shapeFlag & 6 ? pe[pe.indexOf(e)] = o : pe.push(o)), o.patchFlag = -2, o;
  }
  if (no(e) && (e = e.__vccOpts), t) {
    t = zl(t);
    let { class: o, style: f } = t;
    o && !X(o) && (t.class = at(o)), B(f) && (/* @__PURE__ */ rn(f) && !I(f) && (f = ne({}, f)), t.style = Ys(f));
  }
  const l = X(e) ? 1 : Zr(e) ? 128 : ps(e) ? 64 : B(e) ? 4 : k(e) ? 2 : 0;
  return H(
    e,
    t,
    s,
    n,
    r,
    l,
    i,
    !0
  );
}
function zl(e) {
  return e ? /* @__PURE__ */ rn(e) || Vr(e) ? ne({}, e) : e : null;
}
function gt(e, t, s = !1, n = !1) {
  const { props: r, ref: i, patchFlag: l, children: o, transition: f } = e, d = t ? ti(r || {}, t) : r, a = {
    __v_isVNode: !0,
    __v_skip: !0,
    type: e.type,
    props: d,
    key: d && ei(d),
    ref: t && t.ref ? (
      // #2078 in the case of <component :is="vnode" ref="extra"/>
      // if the vnode itself already has a ref, cloneVNode will need to merge
      // the refs so the single vnode can be set on multiple refs
      s && i ? I(i) ? i.concat(Jt(t)) : [i, Jt(t)] : Jt(t)
    ) : i,
    scopeId: e.scopeId,
    slotScopeIds: e.slotScopeIds,
    children: o,
    target: e.target,
    targetStart: e.targetStart,
    targetAnchor: e.targetAnchor,
    staticCount: e.staticCount,
    shapeFlag: e.shapeFlag,
    // if the vnode is cloned with extra props, we can no longer assume its
    // existing patch flag to be reliable and need to add the FULL_PROPS flag.
    // note: preserve flag for fragments since they use the flag for children
    // fast paths only.
    patchFlag: t && e.type !== se ? l === -1 ? 16 : l | 16 : l,
    dynamicProps: e.dynamicProps,
    dynamicChildren: e.dynamicChildren,
    appContext: e.appContext,
    dirs: e.dirs,
    transition: f,
    // These should technically only be non-null on mounted VNodes. However,
    // they *should* be copied for kept-alive vnodes. So we just always copy
    // them since them being non-null during a mount doesn't affect the logic as
    // they will simply be overwritten.
    component: e.component,
    suspense: e.suspense,
    ssContent: e.ssContent && gt(e.ssContent),
    ssFallback: e.ssFallback && gt(e.ssFallback),
    placeholder: e.placeholder,
    el: e.el,
    anchor: e.anchor,
    ctx: e.ctx,
    ce: e.ce,
    cacheIndex: e.cacheIndex
  };
  return f && n && ts(
    a,
    f.clone(a)
  ), a;
}
function Ws(e = " ", t = 0) {
  return he(ys, null, e, t);
}
function ct(e = "", t = !1) {
  return t ? (N(), rt(ye, null, e)) : he(ye, null, e);
}
function Me(e) {
  return e == null || typeof e == "boolean" ? he(ye) : I(e) ? he(
    se,
    null,
    // #3666, avoid reference pollution when reusing vnode
    e.slice()
  ) : ht(e) ? He(e) : he(ys, null, String(e));
}
function He(e) {
  return e.el === null && e.patchFlag !== -1 || e.memo ? e : gt(e);
}
function is(e, t) {
  let s = 0;
  const { shapeFlag: n } = e;
  if (t == null)
    t = null;
  else if (I(t))
    s = 16;
  else if (typeof t == "object")
    if (n & 65) {
      const r = t.default;
      r && (r._c && (r._d = !1), is(e, r()), r._c && (r._d = !0));
      return;
    } else {
      s = 32;
      const r = t._;
      !r && !Vr(t) ? t._ctx = ae : r === 3 && ae && (ae.slots._ === 1 ? t._ = 1 : (t._ = 2, e.patchFlag |= 1024));
    }
  else if (k(t)) {
    if (n & 65) {
      is(e, { default: t });
      return;
    }
    t = { default: t, _ctx: ae }, s = 32;
  } else
    t = String(t), n & 64 ? (s = 16, t = [Ws(t)]) : s = 8;
  e.children = t, e.shapeFlag |= s;
}
function ti(...e) {
  const t = {};
  for (let s = 0; s < e.length; s++) {
    const n = e[s];
    for (const r in n)
      if (r === "class")
        t.class !== n.class && (t.class = at([t.class, n.class]));
      else if (r === "style")
        t.style = Ys([t.style, n.style]);
      else if (os(r)) {
        const i = t[r], l = n[r];
        l && i !== l && !(I(i) && i.includes(l)) ? t[r] = i ? [].concat(i, l) : l : l == null && i == null && // mergeProps({ 'onUpdate:modelValue': undefined }) should not retain
        // the model listener.
        !cs(r) && (t[r] = l);
      } else r !== "" && (t[r] = n[r]);
  }
  return t;
}
function Ae(e, t, s, n = null) {
  Se(e, t, 7, [
    s,
    n
  ]);
}
const Gl = Dr();
let si = 0;
function Jl() {
  return si;
}
function Yl(e, t, s) {
  const n = e.type, r = (t ? t.appContext : e.appContext) || Gl, i = {
    uid: si++,
    vnode: e,
    type: n,
    parent: t,
    appContext: r,
    root: null,
    // to be immediately set
    next: null,
    subTree: null,
    // will be set synchronously right after creation
    effect: null,
    update: null,
    // will be set synchronously right after creation
    job: null,
    scope: new xi(
      !0
      /* detached */
    ),
    render: null,
    proxy: null,
    exposed: null,
    exposeProxy: null,
    withProxy: null,
    provides: t ? t.provides : Object.create(r.provides),
    ids: t ? t.ids : ["", 0, 0],
    accessCache: null,
    renderCache: [],
    // local resolved assets
    components: null,
    directives: null,
    // resolved props and emits options
    propsOptions: qr(n, r),
    emitsOptions: Hr(n, r),
    // emit
    emit: null,
    // to be set immediately
    emitted: null,
    // props default value
    propsDefaults: z,
    // inheritAttrs
    inheritAttrs: n.inheritAttrs,
    // state
    ctx: z,
    data: z,
    props: z,
    attrs: z,
    slots: z,
    refs: z,
    setupState: z,
    setupContext: null,
    // suspense related
    suspense: s,
    suspenseId: s ? s.pendingId : 0,
    asyncDep: null,
    asyncResolved: !1,
    // lifecycle hooks
    // not using enums here because it results in computed properties
    isMounted: !1,
    isUnmounted: !1,
    isDeactivated: !1,
    bc: null,
    c: null,
    bm: null,
    m: null,
    bu: null,
    u: null,
    um: null,
    bum: null,
    da: null,
    a: null,
    rtg: null,
    rtc: null,
    ec: null,
    sp: null
  };
  return i.ctx = { _: i }, i.root = t ? t.root : i, i.emit = Pl.bind(null, i), e.ce && e.ce(i), i;
}
let ie = null;
const Xl = () => ie || ae;
let ls, kt;
{
  const e = us(), t = (s, n) => {
    let r;
    return (r = e[s]) || (r = e[s] = []), r.push(n), (i) => {
      r.length > 1 ? r.forEach((l) => l(i)) : r[0](i);
    };
  };
  ls = t(
    "__VUE_INSTANCE_SETTERS__",
    (s) => ie = s
  ), kt = t(
    "__VUE_SSR_SETTERS__",
    (s) => $t = s
  );
}
const Nt = (e) => {
  const t = ie;
  return ls(e), e.scope.on(), () => {
    e.scope.off(), ls(t);
  };
}, Hn = () => {
  ie && ie.scope.off(), ls(null);
};
function ni(e) {
  return e.vnode.shapeFlag & 4;
}
let $t = !1;
function Zl(e, t = !1, s = !1) {
  t && kt(t);
  const { props: n, children: r } = e.vnode, i = ni(e);
  Fl(e, n, i, t), Hl(e, r, s || t);
  const l = i ? Ql(e, t) : void 0;
  return t && kt(!1), l;
}
function Ql(e, t) {
  const s = e.type;
  e.accessCache = /* @__PURE__ */ Object.create(null), e.proxy = new Proxy(e.ctx, xl);
  const { setup: n } = s;
  if (n) {
    $e();
    const r = e.setupContext = n.length > 1 ? to(e) : null, i = Nt(e), l = jt(
      n,
      e,
      0,
      [
        e.props,
        r
      ]
    ), o = Qn(l);
    if (Fe(), i(), (o || e.sp) && !ut(e) && Mr(e), o) {
      if (l.then(Hn, Hn), t)
        return l.then((f) => {
          kt(!0);
          try {
            Ln(e, f, t);
          } finally {
            kt(!1);
          }
        }).catch((f) => {
          gs(f, e, 0);
        });
      e.asyncDep = l;
    } else
      Ln(e, l);
  } else
    ri(e);
}
function Ln(e, t, s) {
  k(t) ? e.type.__ssrInlineRender ? e.ssrRender = t : e.render = t : B(t) && (e.setupState = vr(t)), ri(e);
}
function ri(e, t, s) {
  const n = e.type;
  e.render || (e.render = n.render || ke);
  {
    const r = Nt(e);
    $e();
    try {
      vl(e);
    } finally {
      Fe(), r();
    }
  }
}
const eo = {
  get(e, t) {
    return re(e, "get", ""), e[t];
  }
};
function to(e) {
  const t = (s) => {
    e.exposed = s || {};
  };
  return {
    attrs: new Proxy(e.attrs, eo),
    slots: e.slots,
    emit: e.emit,
    expose: t
  };
}
function hn(e) {
  return e.exposed ? e.exposeProxy || (e.exposeProxy = new Proxy(vr(Hi(e.exposed)), {
    get(t, s) {
      if (s in t)
        return t[s];
      if (s in At)
        return At[s](e);
    },
    has(t, s) {
      return s in t || s in At;
    }
  })) : e.proxy;
}
function so(e, t = !0) {
  return k(e) ? e.displayName || e.name : e.name || t && e.__name;
}
function no(e) {
  return k(e) && "__vccOpts" in e;
}
const ft = (e, t) => /* @__PURE__ */ Wi(e, t, $t);
function ro(e, t, s) {
  try {
    rs(-1);
    const n = arguments.length;
    return n === 2 ? B(t) && !I(t) ? ht(t) ? he(e, null, [t]) : he(e, t) : he(e, null, t) : (n > 3 ? s = Array.prototype.slice.call(arguments, 2) : n === 3 && ht(s) && (s = [s]), he(e, t, s));
  } finally {
    rs(1);
  }
}
const io = "3.5.44";
let qs;
const Bn = typeof window < "u" && window.trustedTypes;
if (Bn)
  try {
    qs = /* @__PURE__ */ Bn.createPolicy("vue", {
      createHTML: (e) => e
    });
  } catch {
  }
const ii = qs ? (e) => qs.createHTML(e) : (e) => e, lo = "http://www.w3.org/2000/svg", oo = "http://www.w3.org/1998/Math/MathML", De = typeof document < "u" ? document : null, Un = De && /* @__PURE__ */ De.createElement("template"), co = {
  insert: (e, t, s) => {
    t.insertBefore(e, s || null);
  },
  remove: (e) => {
    const t = e.parentNode;
    t && t.removeChild(e);
  },
  createElement: (e, t, s, n) => {
    const r = t === "svg" ? De.createElementNS(lo, e) : t === "mathml" ? De.createElementNS(oo, e) : s ? De.createElement(e, { is: s }) : De.createElement(e);
    return e === "select" && n && n.multiple != null && r.setAttribute("multiple", n.multiple), r;
  },
  createText: (e) => De.createTextNode(e),
  createComment: (e) => De.createComment(e),
  setText: (e, t) => {
    e.nodeValue = t;
  },
  setElementText: (e, t) => {
    e.textContent = t;
  },
  parentNode: (e) => e.parentNode,
  nextSibling: (e) => e.nextSibling,
  querySelector: (e) => De.querySelector(e),
  setScopeId(e, t) {
    e.setAttribute(t, "");
  },
  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  insertStaticContent(e, t, s, n, r, i) {
    const l = s ? s.previousSibling : t.lastChild;
    if (r && (r === i || r.nextSibling))
      for (; t.insertBefore(r.cloneNode(!0), s), !(r === i || !(r = r.nextSibling)); )
        ;
    else {
      Un.innerHTML = ii(
        n === "svg" ? `<svg>${e}</svg>` : n === "mathml" ? `<math>${e}</math>` : e
      );
      const o = Un.content;
      if (n === "svg" || n === "mathml") {
        const f = o.firstChild;
        for (; f.firstChild; )
          o.appendChild(f.firstChild);
        o.removeChild(f);
      }
      t.insertBefore(o, s);
    }
    return [
      // first
      l ? l.nextSibling : t.firstChild,
      // last
      s ? s.previousSibling : t.lastChild
    ];
  }
}, fo = /* @__PURE__ */ Symbol("_vtc");
function ao(e, t, s) {
  const n = e[fo];
  n && (t = (t ? [t, ...n] : [...n]).join(" ")), t == null ? e.removeAttribute("class") : s ? e.setAttribute("class", t) : e.className = t;
}
const Kn = /* @__PURE__ */ Symbol("_vod"), uo = /* @__PURE__ */ Symbol("_vsh"), ho = /* @__PURE__ */ Symbol(""), go = /(?:^|;)\s*display\s*:/;
function po(e, t, s) {
  const n = e.style, r = X(s);
  let i = !1;
  if (s && !r) {
    if (t)
      if (X(t))
        for (const l of t.split(";")) {
          const o = l.slice(0, l.indexOf(":")).trim();
          s[o] == null && St(n, o, "");
        }
      else
        for (const l in t)
          s[l] == null && St(n, l, "");
    for (const l in s) {
      l === "display" && (i = !0);
      const o = s[l];
      o != null ? bo(
        e,
        l,
        !X(t) && t ? t[l] : void 0,
        o
      ) || St(n, l, o) : St(n, l, "");
    }
  } else if (r) {
    if (t !== s) {
      const l = n[ho];
      l && (s += ";" + l), n.cssText = s, i = go.test(s);
    }
  } else t && e.removeAttribute("style");
  Kn in e && ((!r || t !== s) && (e[Kn] = i ? n.display : ""), e[uo] && (n.display = "none"));
}
const qt = /\s*!important$/;
function St(e, t, s) {
  if (I(s))
    s.forEach((n) => St(e, t, n));
  else if (s == null && (s = ""), t.startsWith("--"))
    qt.test(s) ? e.setProperty(t, s.replace(qt, ""), "important") : e.setProperty(t, s);
  else {
    const n = mo(e, t);
    qt.test(s) ? e.setProperty(
      it(n),
      s.replace(qt, ""),
      "important"
    ) : e[n] = s;
  }
}
const Vn = ["Webkit", "Moz", "ms"], Rs = {};
function mo(e, t) {
  const s = Rs[t];
  if (s)
    return s;
  let n = ue(t);
  if (n !== "filter" && n in e)
    return Rs[t] = n;
  n = as(n);
  for (let r = 0; r < Vn.length; r++) {
    const i = Vn[r] + n;
    if (i in e)
      return Rs[t] = i;
  }
  return t;
}
function bo(e, t, s, n) {
  return e.tagName === "TEXTAREA" && (t === "width" || t === "height") && X(n) && s === n;
}
const Wn = "http://www.w3.org/1999/xlink";
function qn(e, t, s, n, r, i = bi(t)) {
  n && t.startsWith("xlink:") ? s == null ? e.removeAttributeNS(Wn, t.slice(6, t.length)) : e.setAttributeNS(Wn, t, s) : s == null || i && !nr(s) ? e.removeAttribute(t) : e.setAttribute(
    t,
    i ? "" : we(s) ? String(s) : s
  );
}
function zn(e, t, s, n, r) {
  if (t === "innerHTML" || t === "textContent") {
    s != null && (e[t] = t === "innerHTML" ? ii(s) : s);
    return;
  }
  const i = e.tagName;
  if (t === "value" && i !== "PROGRESS" && // custom elements may use _value internally
  !i.includes("-")) {
    const o = i === "OPTION" ? e.getAttribute("value") || "" : e.value, f = s == null ? (
      // #11647: value should be set as empty string for null and undefined,
      // but <input type="checkbox"> should be set as 'on'.
      e.type === "checkbox" ? "on" : ""
    ) : String(s);
    (o !== f || !("_value" in e)) && (e.value = f), s == null && e.removeAttribute(t), e._value = s;
    return;
  }
  let l = !1;
  if (s === "" || s == null) {
    const o = typeof e[t];
    o === "boolean" ? s = nr(s) : s == null && o === "string" ? (s = "", l = !0) : o === "number" && (s = 0, l = !0);
  }
  try {
    e[t] = s;
  } catch {
  }
  l && e.removeAttribute(r || t);
}
function yo(e, t, s, n) {
  e.addEventListener(t, s, n);
}
function _o(e, t, s, n) {
  e.removeEventListener(t, s, n);
}
const Gn = /* @__PURE__ */ Symbol("_vei");
function xo(e, t, s, n, r = null) {
  const i = e[Gn] || (e[Gn] = {}), l = i[t];
  if (n && l)
    l.value = n;
  else {
    const [o, f] = So(t);
    if (n) {
      const d = i[t] = Eo(
        n,
        r
      );
      yo(e, o, d, f);
    } else l && (_o(e, o, l, f), i[t] = void 0);
  }
}
const vo = /(Once|Passive|Capture)$/, wo = /^on:?(?:Once|Passive|Capture)$/;
function So(e) {
  let t, s;
  for (; (s = e.match(vo)) && !wo.test(e); )
    t || (t = {}), e = e.slice(0, e.length - s[1].length), t[s[1].toLowerCase()] = !0;
  return [e[2] === ":" ? e.slice(3) : it(e.slice(2)), t];
}
let ks = 0;
const To = /* @__PURE__ */ Promise.resolve(), Co = () => ks || (To.then(() => ks = 0), ks = Date.now());
function Eo(e, t) {
  const s = (n) => {
    if (!n._vts)
      n._vts = Date.now();
    else if (n._vts <= s.attached)
      return;
    const r = s.value;
    if (I(r)) {
      const i = n.stopImmediatePropagation;
      n.stopImmediatePropagation = () => {
        i.call(n), n._stopped = !0;
      };
      const l = r.slice(), o = [n];
      for (let f = 0; f < l.length && !n._stopped; f++) {
        const d = l[f];
        d && Se(
          d,
          t,
          5,
          o
        );
      }
    } else
      Se(
        r,
        t,
        5,
        [n]
      );
  };
  return s.value = e, s.attached = Co(), s;
}
const Jn = (e) => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && // lowercase letter
e.charCodeAt(2) > 96 && e.charCodeAt(2) < 123, Oo = (e, t, s, n, r, i) => {
  const l = r === "svg";
  t === "class" ? ao(e, n, l) : t === "style" ? po(e, s, n) : os(t) ? cs(t) || xo(e, t, s, n, i) : (t[0] === "." ? (t = t.slice(1), !0) : t[0] === "^" ? (t = t.slice(1), !1) : Ao(e, t, n, l)) ? (zn(e, t, n), !e.tagName.includes("-") && (t === "value" || t === "checked" || t === "selected") && qn(e, t, n, l, i, t !== "value")) : /* #11081 force set props for possible async custom element */ e._isVueCE && // #12408 check if it's declared prop or it's async custom element
  (Po(e, t) || // @ts-expect-error _def is private
  e._def.__asyncLoader && (/[A-Z]/.test(t) || !X(n))) ? zn(e, ue(t), n, i, t) : (t === "true-value" ? e._trueValue = n : t === "false-value" && (e._falseValue = n), qn(e, t, n, l));
};
function Ao(e, t, s, n) {
  if (n)
    return !!(t === "innerHTML" || t === "textContent" || t in e && Jn(t) && k(s));
  if (t === "spellcheck" || t === "draggable" || t === "translate" || t === "autocorrect" || t === "sandbox" && e.tagName === "IFRAME" || t === "form" || t === "list" && e.tagName === "INPUT" || t === "type" && e.tagName === "TEXTAREA")
    return !1;
  if (t === "width" || t === "height") {
    const r = e.tagName;
    if (r === "IMG" || r === "VIDEO" || r === "CANVAS" || r === "SOURCE")
      return !1;
  }
  return Jn(t) && X(s) ? !1 : t in e;
}
function Po(e, t) {
  const s = (
    // @ts-expect-error _def is private
    e._def.props
  );
  if (!s)
    return !1;
  const n = ue(t);
  return Array.isArray(s) ? s.some((r) => ue(r) === n) : Object.keys(s).some((r) => ue(r) === n);
}
const Io = /* @__PURE__ */ ne({ patchProp: Oo }, co);
let Yn;
function Mo() {
  return Yn || (Yn = Bl(Io));
}
const Ro = ((...e) => {
  const t = Mo().createApp(...e), { mount: s } = t;
  return t.mount = (n) => {
    const r = $o(n);
    if (!r) return;
    const i = t._component;
    !k(i) && !i.render && !i.template && (i.template = r.innerHTML), r.nodeType === 1 && (r.textContent = "");
    const l = s(r, !1, ko(r));
    return r instanceof Element && (r.removeAttribute("v-cloak"), r.setAttribute("data-v-app", "")), l;
  }, t;
});
function ko(e) {
  if (e instanceof SVGElement)
    return "svg";
  if (typeof MathMLElement == "function" && e instanceof MathMLElement)
    return "mathml";
}
function $o(e) {
  return X(e) ? document.querySelector(e) : e;
}
const Fo = {
  key: 0,
  class: "i-svg-spinners-ring-resize mr-2 animate-spin"
}, jo = "inline-flex items-center justify-center rounded-lg font-medium base-button transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]", Xn = /* @__PURE__ */ on({
  __name: "BaseButton",
  props: {
    variant: {},
    size: {},
    loading: { type: Boolean },
    disabled: { type: Boolean },
    block: { type: Boolean },
    to: {},
    href: {},
    type: {}
  },
  emits: ["click"],
  setup(e, { emit: t }) {
    const s = e, n = t, r = ft(() => s.to || s.href ? "a" : "button"), i = ft(() => {
      switch (s.variant) {
        case "primary":
          return "text-white shadow-sm hover:brightness-105 focus:ring-[var(--theme-primary)]";
        case "secondary":
          return "border border-gray-200 bg-white/70 text-gray-700 shadow-sm hover:bg-gray-50 focus:ring-gray-400 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-200 dark:hover:bg-gray-700";
        case "success":
          return "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 shadow-sm dark:bg-green-600 dark:hover:bg-green-500";
        case "danger":
          return "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-sm dark:bg-red-600 dark:hover:bg-red-500";
        case "ghost":
          return "text-gray-600 hover:bg-gray-100/80 dark:text-gray-400 dark:hover:bg-gray-800/80";
        case "outline":
          return "border border-gray-200 bg-transparent text-gray-700 hover:bg-gray-50 focus:ring-gray-400 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800";
        case "text":
          return "hover:underline p-0 bg-transparent shadow-none hover:bg-transparent";
        default:
          return "text-white shadow-sm hover:brightness-95 focus:ring-green-500";
      }
    }), l = ft(() => {
      if (s.variant === "text")
        return "";
      switch (s.size) {
        case "sm":
          return "px-3 py-1.5 text-sm";
        case "lg":
          return "px-6 py-3 text-lg";
        default:
          return "px-4 py-2 text-sm";
      }
    }), o = ft(() => s.block ? "w-full" : ""), f = ft(() => s.variant === "primary" || !s.variant && s.variant !== "secondary" && s.variant !== "danger" && s.variant !== "success" && s.variant !== "ghost" && s.variant !== "outline" && s.variant !== "text" ? { background: "var(--theme-primary)" } : s.variant === "text" ? { color: "var(--theme-primary)" } : {});
    return (d, a) => (N(), rt(bl(r.value), ti({
      to: e.to,
      href: e.disabled || e.loading ? void 0 : e.href,
      tabindex: e.disabled || e.loading ? -1 : void 0,
      type: !e.to && !e.href ? e.type || "button" : void 0,
      disabled: !e.to && !e.href ? e.disabled || e.loading : void 0,
      "aria-disabled": e.disabled || e.loading || void 0,
      "aria-busy": e.loading || void 0,
      class: [jo, i.value, l.value, o.value],
      style: f.value
    }, d.$attrs, {
      onClick: a[0] || (a[0] = (h) => e.disabled || e.loading ? h.preventDefault() : n("click", h))
    }), {
      default: es(() => [
        e.loading ? (N(), G("div", Fo)) : ct("", !0),
        _l(d.$slots, "default")
      ]),
      _: 3
    }, 16, ["to", "href", "tabindex", "type", "disabled", "aria-disabled", "aria-busy", "class", "style"]));
  }
}), No = { class: "rounded-lg bg-white shadow-sm dark:bg-gray-800" }, Do = { class: "flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700" }, Ho = { class: "min-w-0 flex items-center gap-3" }, Lo = { class: "min-w-0" }, Bo = { class: "truncate text-base text-gray-900 font-semibold dark:text-gray-100" }, Uo = { class: "mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400" }, Ko = { class: "flex shrink-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400" }, Vo = { class: "rounded-lg bg-gray-50 px-2.5 py-1 dark:bg-gray-900/40" }, Wo = { class: "rounded-lg bg-gray-50 px-2.5 py-1 dark:bg-gray-900/40" }, qo = {
  key: 0,
  class: "m-4 rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400"
}, zo = {
  key: 1,
  class: "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 p-4"
}, Go = { class: "relative grid h-24 place-items-center bg-gray-50 dark:bg-gray-900/40" }, Jo = ["src", "alt"], Yo = {
  key: 1,
  class: "grid h-14 w-14 place-items-center rounded-lg bg-white text-sm text-gray-500 font-semibold dark:bg-gray-800"
}, Xo = { class: "min-h-[120px] flex flex-1 flex-col p-3" }, Zo = { class: "truncate text-sm text-gray-900 font-semibold dark:text-gray-100" }, Qo = { class: "mt-1 text-[11px] text-gray-500 dark:text-gray-400" }, ec = { class: "mt-2 flex -space-x-1" }, tc = ["src", "alt"], sc = {
  key: 1,
  class: "text-[10px] text-gray-500"
}, nc = { class: "line-clamp-2 mt-2 text-[11px] text-gray-500 leading-5 dark:text-gray-400" }, rc = {
  key: 0,
  class: "mt-3 border-t border-dashed border-gray-100 pt-3 dark:border-gray-700"
}, ic = { class: "flex items-center justify-between gap-2" }, lc = {
  key: 0,
  class: "mt-1.5 text-[11px] text-gray-500 dark:text-gray-400"
}, oc = { class: "mt-2 text-xs text-gray-800 leading-5 dark:text-gray-200" }, cc = { class: "mt-1.5 grid gap-1.5" }, fc = ["name", "value", "checked", "disabled", "onChange"], ac = { class: "min-w-0 flex-1 break-all" }, uc = {
  key: 0,
  class: "shrink-0 text-[10px] text-red-500"
}, dc = {
  key: 1,
  class: "shrink-0 text-[10px] text-emerald-600"
}, hc = {
  key: 1,
  class: "mt-1.5 text-[11px] text-gray-500 leading-5 dark:text-gray-400"
}, gc = {
  key: 1,
  class: "mt-auto rounded-lg bg-gray-100 px-3 py-2 text-center text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-400"
}, pc = /* @__PURE__ */ on({
  __name: "HeluSolarTermsPanel",
  props: {
    solarTerms: {},
    loading: { type: Boolean },
    labels: {}
  },
  emits: ["claim", "answer"],
  setup(e) {
    const t = {
      currentTerm: "当前节令",
      claimableUnit: "个可领",
      termUnit: "个节令",
      itemPrefix: "物品",
      none: "无",
      termPrefix: "节令",
      reward: "奖励",
      claimReward: "领取奖励",
      unavailable: "不可领取"
    };
    function s(a) {
      const h = Number(a || 0);
      if (!h)
        return "-";
      const p = new Date(h > 1e12 ? h : h * 1e3);
      return Number.isNaN(p.getTime()) ? "-" : p.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: !1 });
    }
    function n(a) {
      return a.itemName || a.name || `${t.itemPrefix}${a.itemId || ""}`;
    }
    function r(a) {
      return a.itemCount || a.count || 1;
    }
    function i(a) {
      return a?.length ? a.map((h) => `${n(h)}x${r(h)}`).join(" / ") : t.none;
    }
    function l(a) {
      return (a || []).slice(0, 3);
    }
    const o = /* @__PURE__ */ vt({});
    function f(a, h) {
      o.value = { ...o.value, [a]: h };
    }
    function d(a) {
      return o.value[a];
    }
    return (a, h) => (N(), G("section", No, [
      H("div", Do, [
        H("div", Ho, [
          h[0] || (h[0] = H("div", { class: "grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300" }, [
            H("div", { class: "i-carbon-notebook" })
          ], -1)),
          H("div", Lo, [
            H("h2", Bo, W(e.labels.notesTab), 1),
            H("div", Uo, W(e.solarTerms?.currentTerm ? `当前节令：${e.solarTerms.currentTerm.title}` : e.solarTerms?.nextTerm ? `下一节令：${e.solarTerms.nextTerm.title}` : "当前暂无开放的节令"), 1)
          ])
        ]),
        H("div", Ko, [
          H("span", Vo, W(e.solarTerms?.claimableCount || 0) + " " + W(t.claimableUnit), 1),
          H("span", Wo, W(e.solarTerms?.terms?.length || 0) + " " + W(t.termUnit), 1)
        ])
      ]),
      e.solarTerms?.terms?.length ? (N(), G("div", zo, [
        (N(!0), G(se, null, As(e.solarTerms.terms, (p) => (N(), G("article", {
          key: p.id,
          class: "min-h-[216px] min-w-0 flex flex-col overflow-hidden border border-gray-200 rounded-lg bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900/20"
        }, [
          H("div", Go, [
            H("span", {
              class: at(["absolute left-0 top-0 rounded-br-lg px-2 py-1 text-[10px] font-semibold", p.claimable ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300"])
            }, W(p.statusLabel), 3),
            p.rewards?.[0]?.image ? (N(), G("img", {
              key: 0,
              src: p.rewards[0].image,
              alt: n(p.rewards[0]),
              class: "max-h-16 max-w-16 object-contain"
            }, null, 8, Jo)) : (N(), G("div", Yo, W((p.title || `${t.termPrefix}${p.id}`).slice(0, 1)), 1))
          ]),
          H("div", Xo, [
            H("div", Zo, W(p.title || `${t.termPrefix} ${p.id}`), 1),
            H("div", Qo, W(s(p.startTime)) + " - " + W(s(p.endTime)), 1),
            H("div", ec, [
              (N(!0), G(se, null, As(l(p.rewards), (T) => (N(), G("span", {
                key: `${p.id}-${T.itemId}-${T.itemCount}`,
                class: "grid h-6 w-6 place-items-center rounded-full bg-white ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700"
              }, [
                T.image ? (N(), G("img", {
                  key: 0,
                  src: T.image,
                  alt: n(T),
                  class: "h-4 w-4 object-contain"
                }, null, 8, tc)) : (N(), G("span", sc, W(n(T).slice(0, 1)), 1))
              ]))), 128))
            ]),
            H("div", nc, W(t.reward) + ": " + W(i(p.rewards)), 1),
            p.answerAvailable ? (N(), G("div", rc, [
              H("div", ic, [
                h[1] || (h[1] = H("span", { class: "text-xs text-gray-900 font-semibold dark:text-gray-100" }, "节令答题", -1)),
                H("span", {
                  class: at(["rounded px-1.5 py-0.5 text-[10px]", p.answerable ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"])
                }, W(p.answerStatus), 3)
              ]),
              p.questionRewards?.length ? (N(), G("div", lc, " 答对奖励: " + W(i(p.questionRewards)), 1)) : ct("", !0),
              H("p", oc, W(p.question), 1),
              H("div", cc, [
                (N(!0), G(se, null, As(p.options, (T, F) => (N(), G("label", {
                  key: `${p.id}-option-${F}`,
                  class: at(["flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs leading-5", [
                    d(p.id) === F ? "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-200" : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300",
                    p.wrongOptions?.includes(F) ? "border-red-200 bg-red-50 text-red-700 opacity-70 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" : "",
                    p.correctOptionIndex === F && !p.answerable ? "border-emerald-500" : ""
                  ]])
                }, [
                  H("input", {
                    type: "radio",
                    name: `solar-${p.id}`,
                    value: F,
                    checked: d(p.id) === F,
                    disabled: e.loading || !p.answerable || p.wrongOptions?.includes(F),
                    class: "mt-1 accent-emerald-600",
                    onChange: (M) => f(p.id, F)
                  }, null, 40, fc),
                  H("span", ac, W(T), 1),
                  p.wrongOptions?.includes(F) ? (N(), G("span", uc, "已判定错误")) : p.correctOptionIndex === F && !p.answerable ? (N(), G("span", dc, "正确答案")) : ct("", !0)
                ], 2))), 128))
              ]),
              p.explanation ? (N(), G("p", hc, W(p.explanation), 1)) : ct("", !0),
              p.answerable ? (N(), rt(Xn, {
                key: 2,
                class: "mt-2 w-full",
                variant: "primary",
                loading: e.loading,
                disabled: e.loading || d(p.id) === void 0 || p.wrongOptions?.includes(d(p.id)),
                onClick: (T) => a.$emit("answer", { id: p.id, optionIndex: d(p.id) })
              }, {
                default: es(() => [...h[2] || (h[2] = [
                  Ws(" 答题领奖 ", -1)
                ])]),
                _: 1
              }, 8, ["loading", "disabled", "onClick"])) : ct("", !0)
            ])) : ct("", !0),
            p.claimable ? (N(), rt(Xn, {
              key: 2,
              class: "mt-auto w-full",
              variant: "primary",
              loading: e.loading,
              disabled: !p.claimable,
              onClick: (T) => a.$emit("claim", p)
            }, {
              default: es(() => [
                Ws(W(p.claimable ? t.claimReward : p.statusLabel || t.unavailable), 1)
              ]),
              _: 2
            }, 1032, ["loading", "disabled", "onClick"])) : (N(), G("div", gc, W(p.statusLabel || t.unavailable), 1))
          ])
        ]))), 128))
      ])) : (N(), G("div", qo, W(e.labels.empty), 1))
    ]));
  }
}), mc = { class: "space-y-3" }, bc = { class: "flex items-center justify-between gap-3" }, yc = ["disabled"], _c = { key: 0 }, xc = {
  key: 1,
  role: "alert"
}, vc = { key: 2 }, wc = /* @__PURE__ */ on({
  __name: "SolarTermsActivityPanel",
  props: {
    host: {}
  },
  emits: ["back"],
  setup(e, { emit: t }) {
    const s = e, n = /* @__PURE__ */ vt(String(s.host?.getAccountId?.() || "")), r = { notesTab: "节令小札", empty: "暂无数据" }, i = {
      success: ($) => s.host?.toast?.success?.($),
      error: ($) => s.host?.toast?.error?.($)
    }, l = /* @__PURE__ */ vt(null), o = /* @__PURE__ */ vt(!1), f = /* @__PURE__ */ vt("");
    let d = 0, a = !1, h;
    async function p() {
      if (a || o.value || !n.value) return;
      const $ = d;
      o.value = !0;
      try {
        const { data: E } = await s.host.api.get("/api/activity/solar-terms");
        if ($ !== d) return;
        l.value = E.solarTerms, f.value = "";
      } catch (E) {
        $ === d && (f.value = E.response?.data?.error || E.message || "节令读取失败");
      } finally {
        o.value = !1, $ !== d && n.value && p();
      }
    }
    async function T($) {
      if (a || o.value || !n.value) return;
      const E = d;
      o.value = !0;
      try {
        const { data: P } = await s.host.api.post("/api/activity/solar-terms/claim", { termId: $.id });
        if (E !== d) return;
        if (!P.ok) throw new Error(P.error || "领取失败");
        l.value = P.solarTerms, P.refreshWarning && l.value && (l.value.warning = P.refreshWarning), i.success("节令奖励领取完成");
      } catch (P) {
        E === d && i.error(P.response?.data?.error || P.message);
      } finally {
        o.value = !1, E !== d && n.value && p();
      }
    }
    async function F($) {
      if (a || o.value || !n.value) return;
      const E = d;
      o.value = !0;
      try {
        const { data: P } = await s.host.api.post("/api/activity/solar-terms/answer", {
          termId: $.id,
          optionIndex: $.optionIndex
        });
        if (E !== d) return;
        if (!P.ok) throw new Error(P.error || "答题失败");
        l.value = P.solarTerms, i[P.correct ? "success" : "error"](P.correct ? "答题正确，奖励已发放" : "答案错误，明天再来");
      } catch (P) {
        E === d && i.error(P.response?.data?.error || P.message);
      } finally {
        o.value = !1, E !== d && n.value && p();
      }
    }
    function M() {
      if (document.visibilityState !== "visible") return;
      const $ = Math.floor(Date.now() / 1e3);
      l.value && !l.value.terms.some((E) => E.startTime <= $ && $ <= E.endTime) || p();
    }
    function J() {
      document.visibilityState === "visible" && p();
    }
    return Gt(n, async () => {
      d++, l.value = null, f.value = "", await p();
    }), kr(() => {
      p(), h = setInterval(M, 3e4), document.addEventListener("visibilitychange", J);
    }), fn(() => {
      a = !0, d++, clearInterval(h), document.removeEventListener("visibilitychange", J);
    }), ($, E) => (N(), G("section", mc, [
      H("div", bc, [
        H("button", {
          onClick: E[0] || (E[0] = (P) => $.$emit("back"))
        }, "← 返回活动列表"),
        H("button", {
          disabled: o.value || !n.value,
          onClick: p
        }, W(o.value ? "加载中…" : "刷新"), 9, yc)
      ]),
      E[1] || (E[1] = H("h2", { class: "text-xl font-semibold" }, "节令小札", -1)),
      n.value ? f.value ? (N(), G("p", xc, W(f.value), 1)) : l.value ? (N(), rt(pc, {
        key: 3,
        "solar-terms": l.value,
        loading: o.value,
        labels: r,
        onClaim: T,
        onAnswer: F
      }, null, 8, ["solar-terms", "loading"])) : (N(), G("p", vc, W(o.value ? "正在读取节令…" : "暂无节令数据"), 1)) : (N(), G("p", _c, "请先选择账号"))
    ]));
  }
});
function Sc(e, t = {}) {
  const s = Ro({
    render: () => ro(wc, {
      host: t,
      onBack: () => t.onBack?.()
    })
  });
  return s.mount(e), {
    unmount: () => {
      try {
        s.unmount();
      } catch {
      }
    }
  };
}
const Cc = { mount: Sc };
export {
  Cc as default,
  Sc as mount
};
