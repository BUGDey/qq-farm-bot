// @__NO_SIDE_EFFECTS__
function un(e) {
  const t = /* @__PURE__ */ Object.create(null);
  for (const s of e.split(",")) t[s] = 1;
  return (s) => s in t;
}
const ie = {}, yt = [], Ye = () => {
}, ui = () => !1, xs = (e) => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && // uppercase letter
(e.charCodeAt(2) > 122 || e.charCodeAt(2) < 97), ks = (e) => e.startsWith("onUpdate:"), ye = Object.assign, cn = (e, t) => {
  const s = e.indexOf(t);
  s > -1 && e.splice(s, 1);
}, ml = Object.prototype.hasOwnProperty, J = (e, t) => ml.call(e, t), V = Array.isArray, ht = (e) => Zt(e) === "[object Map]", fs = (e) => Zt(e) === "[object Set]", In = (e) => Zt(e) === "[object Date]", W = (e) => typeof e == "function", ce = (e) => typeof e == "string", Qe = (e) => typeof e == "symbol", Z = (e) => e !== null && typeof e == "object", ci = (e) => (Z(e) || W(e)) && W(e.then) && W(e.catch), fi = Object.prototype.toString, Zt = (e) => fi.call(e), vl = (e) => Zt(e).slice(8, -1), di = (e) => Zt(e) === "[object Object]", fn = (e) => ce(e) && e !== "NaN" && e[0] !== "-" && "" + parseInt(e, 10) === e, Ht = /* @__PURE__ */ un(
  // the leading comma is intentional so empty string "" is also included
  ",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"
), ws = (e) => {
  const t = /* @__PURE__ */ Object.create(null);
  return ((s) => t[s] || (t[s] = e(s)));
}, _l = /-\w/g, De = ws(
  (e) => e.replace(_l, (t) => t.slice(1).toUpperCase())
), bl = /\B([A-Z])/g, $t = ws(
  (e) => e.replace(bl, "-$1").toLowerCase()
), hi = ws((e) => e.charAt(0).toUpperCase() + e.slice(1)), Ps = ws(
  (e) => e ? `on${hi(e)}` : ""
), Je = (e, t) => !Object.is(e, t), as = (e, ...t) => {
  for (let s = 0; s < e.length; s++)
    e[s](...t);
}, pi = (e, t, s, n = !1) => {
  Object.defineProperty(e, t, {
    configurable: !0,
    enumerable: !1,
    writable: n,
    value: s
  });
}, dn = (e) => {
  const t = parseFloat(e);
  return isNaN(t) ? e : t;
};
let An;
const $s = () => An || (An = typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : typeof global < "u" ? global : {});
function be(e) {
  if (V(e)) {
    const t = {};
    for (let s = 0; s < e.length; s++) {
      const n = e[s], i = ce(n) ? wl(n) : be(n);
      if (i)
        for (const l in i)
          t[l] = i[l];
    }
    return t;
  } else if (ce(e) || Z(e))
    return e;
}
const yl = /;(?![^(]*\))/g, xl = /:([^]+)/, kl = /"(?:[^"\\]|\\[^])*"|'(?:[^'\\]|\\[^])*'|\\[^]|\/\*[^]*?\*\//g;
function wl(e) {
  const t = {};
  return e.replace(kl, (s) => s.startsWith("/*") ? "" : s).split(yl).forEach((s) => {
    if (s) {
      const n = s.split(xl);
      n.length > 1 && (t[n[0].trim()] = n[1].trim());
    }
  }), t;
}
function Se(e) {
  let t = "";
  if (ce(e))
    t = e;
  else if (V(e))
    for (let s = 0; s < e.length; s++) {
      const n = Se(e[s]);
      n && (t += n + " ");
    }
  else if (Z(e))
    for (const s in e)
      e[s] && (t += s + " ");
  return t.trim();
}
const $l = "itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,playsinline,readonly", Sl = /* @__PURE__ */ un($l);
function gi(e) {
  return !!e || e === "";
}
function Cl(e, t, s) {
  if (e.length !== t.length) return !1;
  let n = !0;
  for (let i = 0; n && i < e.length; i++)
    n = Ss(e[i], t[i], s);
  return n;
}
function Nn(e, t, s) {
  if (e.size !== t.size) return !1;
  const n = Array.from(t), i = new Uint8Array(n.length);
  for (const l of e) {
    let o = -1;
    for (let a = 0; a < n.length; a++)
      if (!i[a] && Ss(l, n[a], s)) {
        o = a;
        break;
      }
    if (o < 0) return !1;
    i[o] = 1;
  }
  return !0;
}
function Tl(e, t, s) {
  let n = ht(e), i = ht(t);
  if (n || i || (n = fs(e), i = fs(t), n || i))
    return n && i ? Nn(e, t, s) : !1;
  const l = Object.keys(e).length, o = Object.keys(t).length;
  if (l !== o)
    return !1;
  for (const a in e) {
    const f = e.hasOwnProperty(a), h = t.hasOwnProperty(a);
    if (f && !h || !f && h || !Ss(e[a], t[a], s))
      return !1;
  }
  return String(e) === String(t);
}
function On(e, t, s, n) {
  s || (s = [/* @__PURE__ */ new Map(), /* @__PURE__ */ new Map()]);
  const [i, l] = s;
  if (i.has(e) || l.has(t))
    return i.get(e) === t && l.get(t) === e;
  i.set(e, t), l.set(t, e);
  const o = n(e, t, s);
  return i.delete(e), l.delete(t), o;
}
function Ss(e, t, s) {
  if (e === t) return !0;
  let n = In(e), i = In(t);
  return n || i ? n && i ? e.getTime() === t.getTime() : !1 : (n = Qe(e), i = Qe(t), n || i ? e === t : (n = V(e), i = V(t), n || i ? n && i ? On(e, t, s, Cl) : !1 : (n = Z(e), i = Z(t), n || i ? !n || !i ? !1 : On(e, t, s, Tl) : String(e) === String(t))));
}
const mi = (e) => !!(e && e.__v_isRef === !0), $ = (e) => ce(e) ? e : e == null ? "" : V(e) || Z(e) && (e.toString === fi || !W(e.toString)) ? mi(e) ? $(e.value) : JSON.stringify(e, vi, 2) : String(e), vi = (e, t) => mi(t) ? vi(e, t.value) : ht(t) ? {
  [`Map(${t.size})`]: [...t.entries()].reduce(
    (s, [n, i], l) => (s[Fs(n, l) + " =>"] = i, s),
    {}
  )
} : fs(t) ? {
  [`Set(${t.size})`]: [...t.values()].map((s) => Fs(s))
} : Qe(t) ? Fs(t) : Z(t) && !V(t) && !di(t) ? String(t) : t, Fs = (e, t = "") => {
  var s;
  return (
    // Symbol.description in es2019+ so we need to cast here to pass
    // the lib: es2016 check
    Qe(e) ? `Symbol(${(s = e.description) != null ? s : t})` : e
  );
};
let _e;
class Ml {
  // TODO isolatedDeclarations "__v_skip"
  constructor(t = !1) {
    this.detached = t, this._active = !0, this._on = 0, this.effects = [], this.cleanups = [], this._isPaused = !1, this._warnOnRun = !0, this.__v_skip = !0, !t && _e && (_e.active ? (this.parent = _e, this.index = (_e.scopes || (_e.scopes = [])).push(
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
        const i = this.scopes.slice();
        for (t = 0, s = i.length; t < s; t++)
          i[t].resume();
      }
      const n = this.effects.slice();
      for (t = 0, s = n.length; t < s; t++)
        n[t].resume();
    }
  }
  run(t) {
    if (this._active) {
      const s = _e;
      try {
        return _e = this, t();
      } finally {
        _e = s;
      }
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  on() {
    ++this._on === 1 && (this.prevScope = _e, _e = this);
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  off() {
    if (this._on > 0 && --this._on === 0) {
      if (_e === this)
        _e = this.prevScope;
      else {
        let t = _e;
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
        const i = this.scopes.slice();
        for (s = 0, n = i.length; s < n; s++)
          i[s].stop(!0);
        this.scopes.length = 0;
      }
      if (!this.detached && this.parent && !t) {
        const i = this.parent.scopes.pop();
        i && i !== this && (this.parent.scopes[this.index] = i, i.index = this.index);
      }
      this.parent = void 0;
    }
  }
}
function El() {
  return _e;
}
let le;
const Ds = /* @__PURE__ */ new WeakSet();
class _i {
  constructor(t) {
    this.fn = t, this.deps = void 0, this.depsTail = void 0, this.flags = 5, this.next = void 0, this.cleanup = void 0, this.scheduler = void 0, _e && (_e.active ? _e.effects.push(this) : this.flags &= -2);
  }
  pause() {
    this.flags |= 64;
  }
  resume() {
    this.flags & 64 && (this.flags &= -65, Ds.has(this) && (Ds.delete(this), this.trigger()));
  }
  /**
   * @internal
   */
  notify() {
    this.flags & 2 && !(this.flags & 32) || this.flags & 8 || yi(this);
  }
  run() {
    if (!(this.flags & 1))
      return this.fn();
    this.flags |= 2, Rn(this), xi(this);
    const t = le, s = Le;
    le = this, Le = !0;
    try {
      return this.fn();
    } finally {
      ki(this), le = t, Le = s, this.flags &= -3;
    }
  }
  stop() {
    if (this.flags & 1) {
      for (let t = this.deps; t; t = t.nextDep)
        gn(t);
      this.deps = this.depsTail = void 0, Rn(this), this.onStop && this.onStop(), this.flags &= -2;
    }
  }
  trigger() {
    this.flags & 64 ? Ds.add(this) : this.scheduler ? this.scheduler() : this.runIfDirty();
  }
  /**
   * @internal
   */
  runIfDirty() {
    Ys(this) && this.run();
  }
  get dirty() {
    return Ys(this);
  }
}
let bi = 0, Ut, jt;
function yi(e, t = !1) {
  if (e.flags |= 8, t) {
    e.next = jt, jt = e;
    return;
  }
  e.next = Ut, Ut = e;
}
function hn() {
  bi++;
}
function pn() {
  if (--bi > 0)
    return;
  if (jt) {
    let t = jt;
    for (jt = void 0; t; ) {
      const s = t.next;
      t.next = void 0, t.flags &= -9, t = s;
    }
  }
  let e;
  for (; Ut; ) {
    let t = Ut;
    for (Ut = void 0; t; ) {
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
function xi(e) {
  for (let t = e.deps; t; t = t.nextDep)
    t.version = -1, t.prevActiveLink = t.dep.activeLink, t.dep.activeLink = t;
}
function ki(e) {
  let t, s = e.depsTail, n = s;
  for (; n; ) {
    const i = n.prevDep;
    n.version === -1 ? (n === s && (s = i), gn(n), Il(n)) : t = n, n.dep.activeLink = n.prevActiveLink, n.prevActiveLink = void 0, n = i;
  }
  e.deps = t, e.depsTail = s;
}
function Ys(e) {
  for (let t = e.deps; t; t = t.nextDep)
    if (t.dep.version !== t.version || t.dep.computed && (wi(t.dep.computed) || t.dep.version !== t.version))
      return !0;
  return !!e._dirty;
}
function wi(e) {
  if (e.flags & 4 && !(e.flags & 16) || (e.flags &= -17, e.globalVersion === qt) || (e.globalVersion = qt, !e.isSSR && e.flags & 128 && (!e.deps && !e._dirty || !Ys(e))))
    return;
  e.flags |= 2;
  const t = e.dep, s = le, n = Le;
  le = e, Le = !0;
  try {
    xi(e);
    const i = e.fn(e._value);
    (t.version === 0 || Je(i, e._value)) && (e.flags |= 128, e._value = i, t.version++);
  } catch (i) {
    throw t.version++, i;
  } finally {
    le = s, Le = n, ki(e), e.flags &= -3;
  }
}
function gn(e, t = !1) {
  const { dep: s, prevSub: n, nextSub: i } = e;
  if (n && (n.nextSub = i, e.prevSub = void 0), i && (i.prevSub = n, e.nextSub = void 0), s.subs === e && (s.subs = n, !n && s.computed)) {
    s.computed.flags &= -5;
    for (let l = s.computed.deps; l; l = l.nextDep)
      gn(l, !0);
  }
  !t && !--s.sc && s.map && s.map.delete(s.key);
}
function Il(e) {
  const { prevDep: t, nextDep: s } = e;
  t && (t.nextDep = s, e.prevDep = void 0), s && (s.prevDep = t, e.nextDep = void 0);
}
let Le = !0;
const $i = [];
function Xe() {
  $i.push(Le), Le = !1;
}
function Ze() {
  const e = $i.pop();
  Le = e === void 0 ? !0 : e;
}
function Rn(e) {
  const { cleanup: t } = e;
  if (e.cleanup = void 0, t) {
    const s = le;
    le = void 0;
    try {
      t();
    } finally {
      le = s;
    }
  }
}
let qt = 0;
class Al {
  constructor(t, s) {
    this.sub = t, this.dep = s, this.version = s.version, this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
  }
}
class mn {
  // TODO isolatedDeclarations "__v_skip"
  constructor(t) {
    this.computed = t, this.version = 0, this.activeLink = void 0, this.subs = void 0, this.map = void 0, this.key = void 0, this.sc = 0, this.__v_skip = !0;
  }
  track(t) {
    if (!le || !Le || le === this.computed)
      return;
    let s = this.activeLink;
    if (s === void 0 || s.sub !== le)
      s = this.activeLink = new Al(le, this), le.deps ? (s.prevDep = le.depsTail, le.depsTail.nextDep = s, le.depsTail = s) : le.deps = le.depsTail = s, Si(s);
    else if (s.version === -1 && (s.version = this.version, s.nextDep)) {
      const n = s.nextDep;
      n.prevDep = s.prevDep, s.prevDep && (s.prevDep.nextDep = n), s.prevDep = le.depsTail, s.nextDep = void 0, le.depsTail.nextDep = s, le.depsTail = s, le.deps === s && (le.deps = n);
    }
    return s;
  }
  trigger(t) {
    this.version++, qt++, this.notify(t);
  }
  notify(t) {
    hn();
    try {
      for (let s = this.subs; s; s = s.prevSub)
        s.sub.notify() && s.sub.dep.notify();
    } finally {
      pn();
    }
  }
}
function Si(e) {
  if (e.dep.sc++, e.sub.flags & 4) {
    const t = e.dep.computed;
    if (t && !e.dep.subs) {
      t.flags |= 20;
      for (let n = t.deps; n; n = n.nextDep)
        Si(n);
    }
    const s = e.dep.subs;
    s !== e && (e.prevSub = s, s && (s.nextSub = e)), e.dep.subs = e;
  }
}
const Qs = /* @__PURE__ */ new WeakMap(), xt = /* @__PURE__ */ Symbol(
  ""
), Xs = /* @__PURE__ */ Symbol(
  ""
), Gt = /* @__PURE__ */ Symbol(
  ""
);
function xe(e, t, s) {
  if (Le && le) {
    let n = Qs.get(e);
    n || Qs.set(e, n = /* @__PURE__ */ new Map());
    let i = n.get(s);
    i || (n.set(s, i = new mn()), i.map = n, i.key = s), i.track();
  }
}
function ot(e, t, s, n, i, l) {
  const o = Qs.get(e);
  if (!o) {
    qt++;
    return;
  }
  const a = (f) => {
    f && f.trigger();
  };
  if (hn(), t === "clear")
    o.forEach(a);
  else {
    const f = V(e), h = f && fn(s);
    if (f && s === "length") {
      const d = Number(n);
      o.forEach((_, A) => {
        (A === "length" || A === Gt || !Qe(A) && A >= d) && a(_);
      });
    } else
      switch ((s !== void 0 || o.has(void 0)) && a(o.get(s)), h && a(o.get(Gt)), t) {
        case "add":
          f ? h && a(o.get("length")) : (a(o.get(xt)), ht(e) && a(o.get(Xs)));
          break;
        case "delete":
          f || (a(o.get(xt)), ht(e) && a(o.get(Xs)));
          break;
        case "set":
          ht(e) && a(o.get(xt));
          break;
      }
  }
  pn();
}
function Ct(e) {
  const t = /* @__PURE__ */ Q(e);
  return t === e || (xe(t, "iterate", Gt), /* @__PURE__ */ Re(e)) ? t : /* @__PURE__ */ et(e) ? /* @__PURE__ */ pt(e) ? t.map((s) => gt(Pe(s))) : t.map(gt) : t.map(Pe);
}
function Cs(e) {
  return xe(e = /* @__PURE__ */ Q(e), "iterate", Gt), e;
}
function qe(e, t) {
  return /* @__PURE__ */ et(e) ? gt(/* @__PURE__ */ pt(e) ? Pe(t) : t) : Pe(t);
}
const Nl = {
  __proto__: null,
  [Symbol.iterator]() {
    return Ls(this, Symbol.iterator, (e) => qe(this, e));
  },
  concat(...e) {
    return Ct(this).concat(
      ...e.map((t) => V(t) ? Ct(t) : t)
    );
  },
  entries() {
    return Ls(this, "entries", (e) => (e[1] = qe(this, e[1]), e));
  },
  every(e, t) {
    return it(this, "every", e, t, void 0, arguments);
  },
  filter(e, t) {
    return it(
      this,
      "filter",
      e,
      t,
      (s) => s.map((n) => qe(this, n)),
      arguments
    );
  },
  find(e, t) {
    return it(
      this,
      "find",
      e,
      t,
      (s) => qe(this, s),
      arguments
    );
  },
  findIndex(e, t) {
    return it(this, "findIndex", e, t, void 0, arguments);
  },
  findLast(e, t) {
    return it(
      this,
      "findLast",
      e,
      t,
      (s) => qe(this, s),
      arguments
    );
  },
  findLastIndex(e, t) {
    return it(this, "findLastIndex", e, t, void 0, arguments);
  },
  // flat, flatMap could benefit from ARRAY_ITERATE but are not straight-forward to implement
  forEach(e, t) {
    return it(this, "forEach", e, t, void 0, arguments);
  },
  includes(...e) {
    return Bs(this, "includes", e);
  },
  indexOf(...e) {
    return Bs(this, "indexOf", e);
  },
  join(e) {
    return Ct(this).join(e);
  },
  // keys() iterator only reads `length`, no optimization required
  lastIndexOf(...e) {
    return Bs(this, "lastIndexOf", e);
  },
  map(e, t) {
    return it(this, "map", e, t, void 0, arguments);
  },
  pop() {
    return Pt(this, "pop");
  },
  push(...e) {
    return Pt(this, "push", e);
  },
  reduce(e, ...t) {
    return Fn(this, "reduce", e, t);
  },
  reduceRight(e, ...t) {
    return Fn(this, "reduceRight", e, t);
  },
  shift() {
    return Pt(this, "shift");
  },
  // slice could use ARRAY_ITERATE but also seems to beg for range tracking
  some(e, t) {
    return it(this, "some", e, t, void 0, arguments);
  },
  splice(...e) {
    return Pt(this, "splice", e);
  },
  toReversed() {
    return Ct(this).toReversed();
  },
  toSorted(e) {
    return Ct(this).toSorted(e);
  },
  toSpliced(...e) {
    return Ct(this).toSpliced(...e);
  },
  unshift(...e) {
    return Pt(this, "unshift", e);
  },
  values() {
    return Ls(this, "values", (e) => qe(this, e));
  }
};
function Ls(e, t, s) {
  const n = Cs(e), i = n[t], l = i.call(n);
  if (n !== e && !/* @__PURE__ */ Re(e)) {
    if (l[Symbol.toStringTag] === "Array Iterator") {
      const o = Object.create(Object.getPrototypeOf(l));
      return o.next = () => Pn(l.next(), s), i !== Ci[t] && Object.defineProperties(o, {
        return: {
          get() {
            const a = l.return;
            return typeof a == "function" ? a.bind(l) : a;
          }
        },
        throw: {
          get() {
            const a = l.throw;
            return typeof a == "function" ? a.bind(l) : a;
          }
        }
      }), o;
    }
    l._next = l.next, l.next = () => Pn(l._next(), s);
  }
  return l;
}
function Pn(e, t) {
  return e.done || (e.value = t(e.value)), e;
}
const Ci = Array.prototype;
function it(e, t, s, n, i, l) {
  const o = Cs(e), a = o !== e && !/* @__PURE__ */ Re(e), f = o[t];
  if (f !== Ci[t]) {
    const _ = f.apply(e, l);
    return a ? Pe(_) : _;
  }
  let h = s;
  o !== e && (a ? h = function(_, A) {
    return s.call(this, qe(e, _), A, e);
  } : s.length > 2 && (h = function(_, A) {
    return s.call(this, _, A, e);
  }));
  const d = f.call(o, h, n);
  return a && i ? i(d) : d;
}
function Fn(e, t, s, n) {
  const i = Cs(e), l = i !== e && !/* @__PURE__ */ Re(e);
  let o = s, a = !1;
  i !== e && (l ? (a = n.length === 0, o = function(h, d, _) {
    return a && (a = !1, h = qe(e, h)), s.call(this, h, qe(e, d), _, e);
  }) : s.length > 3 && (o = function(h, d, _) {
    return s.call(this, h, d, _, e);
  }));
  const f = i[t](o, ...n);
  return a ? qe(e, f) : f;
}
function Bs(e, t, s) {
  const n = /* @__PURE__ */ Q(e);
  xe(n, "iterate", Gt);
  const i = n[t](...s);
  return (i === -1 || i === !1) && /* @__PURE__ */ yn(s[0]) ? (s[0] = /* @__PURE__ */ Q(s[0]), n[t](...s)) : i;
}
function Pt(e, t, s = []) {
  Xe(), hn();
  const n = (/* @__PURE__ */ Q(e))[t].apply(e, s);
  return pn(), Ze(), n;
}
const Ol = /* @__PURE__ */ un("__proto__,__v_isRef,__isVue"), Ti = new Set(
  /* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((e) => e !== "arguments" && e !== "caller").map((e) => Symbol[e]).filter(Qe)
);
function Rl(e) {
  Qe(e) || (e = String(e));
  const t = /* @__PURE__ */ Q(this);
  return xe(t, "has", e), t.hasOwnProperty(e);
}
class Mi {
  constructor(t = !1, s = !1) {
    this._isReadonly = t, this._isShallow = s;
  }
  get(t, s, n) {
    if (s === "__v_skip") return t.__v_skip;
    const i = this._isReadonly, l = this._isShallow;
    if (s === "__v_isReactive")
      return !i;
    if (s === "__v_isReadonly")
      return i;
    if (s === "__v_isShallow")
      return l;
    if (s === "__v_raw")
      return n === (i ? l ? Kl : Ni : l ? Ai : Ii).get(t) || // receiver is not the reactive proxy, but has the same prototype
      // this means the receiver is a user proxy of the reactive proxy
      Object.getPrototypeOf(t) === Object.getPrototypeOf(n) ? t : void 0;
    const o = V(t);
    if (!i) {
      let f;
      if (o && (f = Nl[s]))
        return f;
      if (s === "hasOwnProperty")
        return Rl;
    }
    const a = Reflect.get(
      t,
      s,
      // if this is a proxy wrapping a ref, return methods using the raw ref
      // as receiver so that we don't have to call `toRaw` on the ref in all
      // its class methods
      /* @__PURE__ */ ke(t) ? t : n
    );
    if ((Qe(s) ? Ti.has(s) : Ol(s)) || (i || xe(t, "get", s), l))
      return a;
    if (/* @__PURE__ */ ke(a)) {
      const f = o && fn(s) ? a : a.value;
      return i && Z(f) ? /* @__PURE__ */ en(f) : f;
    }
    return Z(a) ? i ? /* @__PURE__ */ en(a) : /* @__PURE__ */ _n(a) : a;
  }
}
class Ei extends Mi {
  constructor(t = !1) {
    super(!1, t);
  }
  set(t, s, n, i) {
    let l = t[s];
    const o = V(t) && fn(s);
    if (!this._isShallow) {
      const h = /* @__PURE__ */ et(l);
      if (!/* @__PURE__ */ Re(n) && !/* @__PURE__ */ et(n) && (l = /* @__PURE__ */ Q(l), n = /* @__PURE__ */ Q(n)), !o && /* @__PURE__ */ ke(l) && !/* @__PURE__ */ ke(n))
        return h || (l.value = n), !0;
    }
    const a = o ? Number(s) < t.length : J(t, s), f = Reflect.set(
      t,
      s,
      n,
      /* @__PURE__ */ ke(t) ? t : i
    );
    return t === /* @__PURE__ */ Q(i) && f && (a ? Je(n, l) && ot(t, "set", s, n) : ot(t, "add", s, n)), f;
  }
  deleteProperty(t, s) {
    const n = J(t, s);
    t[s];
    const i = Reflect.deleteProperty(t, s);
    return i && n && ot(t, "delete", s, void 0), i;
  }
  has(t, s) {
    const n = Reflect.has(t, s);
    return (!Qe(s) || !Ti.has(s)) && xe(t, "has", s), n;
  }
  ownKeys(t) {
    return xe(
      t,
      "iterate",
      V(t) ? "length" : xt
    ), Reflect.ownKeys(t);
  }
}
class Pl extends Mi {
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
const Fl = /* @__PURE__ */ new Ei(), Dl = /* @__PURE__ */ new Pl(), Ll = /* @__PURE__ */ new Ei(!0);
const Zs = (e) => e, ss = (e) => Reflect.getPrototypeOf(e);
function Bl(e, t, s) {
  return function(...n) {
    const i = this.__v_raw, l = /* @__PURE__ */ Q(i), o = ht(l), a = e === "entries" || e === Symbol.iterator && o, f = e === "keys" && o, h = i[e](...n), d = s ? Zs : t ? gt : Pe;
    return !t && xe(
      l,
      "iterate",
      f ? Xs : xt
    ), ye(
      // inheriting all iterator properties
      Object.create(h),
      {
        // iterator protocol
        next() {
          const { value: _, done: A } = h.next();
          return A ? { value: _, done: A } : {
            value: a ? [d(_[0]), d(_[1])] : d(_),
            done: A
          };
        }
      }
    );
  };
}
function ns(e) {
  return function(...t) {
    return e === "delete" ? !1 : e === "clear" ? void 0 : this;
  };
}
function Hl(e, t) {
  const s = {
    get(i) {
      const l = this.__v_raw, o = /* @__PURE__ */ Q(l), a = /* @__PURE__ */ Q(i);
      e || (Je(i, a) && xe(o, "get", i), xe(o, "get", a));
      const { has: f } = ss(o), h = t ? Zs : e ? gt : Pe;
      if (f.call(o, i))
        return h(l.get(i));
      if (f.call(o, a))
        return h(l.get(a));
      l !== o && l.get(i);
    },
    get size() {
      const i = this.__v_raw;
      return !e && xe(/* @__PURE__ */ Q(i), "iterate", xt), i.size;
    },
    has(i) {
      const l = this.__v_raw, o = /* @__PURE__ */ Q(l), a = /* @__PURE__ */ Q(i);
      return e || (Je(i, a) && xe(o, "has", i), xe(o, "has", a)), i === a ? l.has(i) : l.has(i) || l.has(a);
    },
    forEach(i, l) {
      const o = this, a = o.__v_raw, f = /* @__PURE__ */ Q(a), h = t ? Zs : e ? gt : Pe;
      return !e && xe(f, "iterate", xt), a.forEach((d, _) => i.call(l, h(d), h(_), o));
    }
  };
  return ye(
    s,
    e ? {
      add: ns("add"),
      set: ns("set"),
      delete: ns("delete"),
      clear: ns("clear")
    } : {
      add(i) {
        const l = /* @__PURE__ */ Q(this), o = ss(l), a = /* @__PURE__ */ Q(i), f = !t && !/* @__PURE__ */ Re(i) && !/* @__PURE__ */ et(i) ? a : i;
        return o.has.call(l, f) || Je(i, f) && o.has.call(l, i) || Je(a, f) && o.has.call(l, a) || (l.add(f), ot(l, "add", f, f)), this;
      },
      set(i, l) {
        !t && !/* @__PURE__ */ Re(l) && !/* @__PURE__ */ et(l) && (l = /* @__PURE__ */ Q(l));
        const o = /* @__PURE__ */ Q(this), { has: a, get: f } = ss(o);
        let h = a.call(o, i);
        h || (i = /* @__PURE__ */ Q(i), h = a.call(o, i));
        const d = f.call(o, i);
        return o.set(i, l), h ? Je(l, d) && ot(o, "set", i, l) : ot(o, "add", i, l), this;
      },
      delete(i) {
        const l = /* @__PURE__ */ Q(this), { has: o, get: a } = ss(l);
        let f = o.call(l, i);
        f || (i = /* @__PURE__ */ Q(i), f = o.call(l, i)), a && a.call(l, i);
        const h = l.delete(i);
        return f && ot(l, "delete", i, void 0), h;
      },
      clear() {
        const i = /* @__PURE__ */ Q(this), l = i.size !== 0, o = i.clear();
        return l && ot(
          i,
          "clear",
          void 0,
          void 0
        ), o;
      }
    }
  ), [
    "keys",
    "values",
    "entries",
    Symbol.iterator
  ].forEach((i) => {
    s[i] = Bl(i, e, t);
  }), s;
}
function vn(e, t) {
  const s = Hl(e, t);
  return (n, i, l) => i === "__v_isReactive" ? !e : i === "__v_isReadonly" ? e : i === "__v_isShallow" ? t : i === "__v_raw" ? n : Reflect.get(
    J(s, i) && i in n ? s : n,
    i,
    l
  );
}
const Ul = {
  get: /* @__PURE__ */ vn(!1, !1)
}, jl = {
  get: /* @__PURE__ */ vn(!1, !0)
}, Vl = {
  get: /* @__PURE__ */ vn(!0, !1)
};
const Ii = /* @__PURE__ */ new WeakMap(), Ai = /* @__PURE__ */ new WeakMap(), Ni = /* @__PURE__ */ new WeakMap(), Kl = /* @__PURE__ */ new WeakMap();
function Wl(e) {
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
function _n(e) {
  return /* @__PURE__ */ et(e) ? e : bn(
    e,
    !1,
    Fl,
    Ul,
    Ii
  );
}
// @__NO_SIDE_EFFECTS__
function ql(e) {
  return bn(
    e,
    !1,
    Ll,
    jl,
    Ai
  );
}
// @__NO_SIDE_EFFECTS__
function en(e) {
  return bn(
    e,
    !0,
    Dl,
    Vl,
    Ni
  );
}
function bn(e, t, s, n, i) {
  if (!Z(e) || e.__v_raw && !(t && e.__v_isReactive) || e.__v_skip || !Object.isExtensible(e))
    return e;
  const l = i.get(e);
  if (l)
    return l;
  const o = Wl(vl(e));
  if (o === 0)
    return e;
  const a = new Proxy(
    e,
    o === 2 ? n : s
  );
  return i.set(e, a), a;
}
// @__NO_SIDE_EFFECTS__
function pt(e) {
  return /* @__PURE__ */ et(e) ? /* @__PURE__ */ pt(e.__v_raw) : !!(e && e.__v_isReactive);
}
// @__NO_SIDE_EFFECTS__
function et(e) {
  return !!(e && e.__v_isReadonly);
}
// @__NO_SIDE_EFFECTS__
function Re(e) {
  return !!(e && e.__v_isShallow);
}
// @__NO_SIDE_EFFECTS__
function yn(e) {
  return e ? !!e.__v_raw : !1;
}
// @__NO_SIDE_EFFECTS__
function Q(e) {
  const t = e && e.__v_raw;
  return t ? /* @__PURE__ */ Q(t) : e;
}
function Gl(e) {
  return !J(e, "__v_skip") && Object.isExtensible(e) && pi(e, "__v_skip", !0), e;
}
const Pe = (e) => Z(e) ? /* @__PURE__ */ _n(e) : e, gt = (e) => Z(e) ? /* @__PURE__ */ en(e) : e;
// @__NO_SIDE_EFFECTS__
function ke(e) {
  return e ? e.__v_isRef === !0 : !1;
}
// @__NO_SIDE_EFFECTS__
function ve(e) {
  return zl(e, !1);
}
function zl(e, t) {
  return /* @__PURE__ */ ke(e) ? e : new Jl(e, t);
}
class Jl {
  constructor(t, s) {
    this.dep = new mn(), this.__v_isRef = !0, this.__v_isShallow = !1, this._rawValue = s ? t : /* @__PURE__ */ Q(t), this._value = s ? t : Pe(t), this.__v_isShallow = s;
  }
  get value() {
    return this.dep.track(), this._value;
  }
  set value(t) {
    const s = this._rawValue, n = this.__v_isShallow || /* @__PURE__ */ Re(t) || /* @__PURE__ */ et(t);
    t = n ? t : /* @__PURE__ */ Q(t), Je(t, s) && (this._rawValue = t, this._value = n ? t : Pe(t), this.dep.trigger());
  }
}
function Yl(e) {
  return /* @__PURE__ */ ke(e) ? e.value : e;
}
const Ql = {
  get: (e, t, s) => t === "__v_raw" ? e : Yl(Reflect.get(e, t, s)),
  set: (e, t, s, n) => {
    const i = e[t];
    return /* @__PURE__ */ ke(i) && !/* @__PURE__ */ ke(s) ? (i.value = s, !0) : Reflect.set(e, t, s, n);
  }
};
function Oi(e) {
  return /* @__PURE__ */ pt(e) ? e : new Proxy(e, Ql);
}
class Xl {
  constructor(t, s, n) {
    this.fn = t, this.setter = s, this._value = void 0, this.dep = new mn(this), this.__v_isRef = !0, this.deps = void 0, this.depsTail = void 0, this.flags = 16, this.globalVersion = qt - 1, this.next = void 0, this.effect = this, this.__v_isReadonly = !s, this.isSSR = n;
  }
  /**
   * @internal
   */
  notify() {
    if (this.flags |= 16, !(this.flags & 8) && // avoid infinite self recursion
    le !== this)
      return yi(this, !0), !0;
  }
  get value() {
    const t = this.dep.track();
    return wi(this), t && (t.version = this.dep.version), this._value;
  }
  set value(t) {
    this.setter && this.setter(t);
  }
}
// @__NO_SIDE_EFFECTS__
function Zl(e, t, s = !1) {
  let n, i;
  return W(e) ? n = e : (n = e.get, i = e.set), new Xl(n, i, s);
}
const is = {}, ds = /* @__PURE__ */ new WeakMap();
let bt;
function er(e, t = !1, s = bt) {
  if (s) {
    let n = ds.get(s);
    n || ds.set(s, n = []), n.push(e);
  }
}
function tr(e, t, s = ie) {
  const { immediate: n, deep: i, once: l, scheduler: o, augmentJob: a, call: f } = s, h = (I) => i ? I : /* @__PURE__ */ Re(I) || i === !1 || i === 0 ? at(I, 1) : at(I);
  let d, _, A, w, P = !1, y = !1;
  if (/* @__PURE__ */ ke(e) ? (_ = () => e.value, P = /* @__PURE__ */ Re(e)) : /* @__PURE__ */ pt(e) ? (_ = () => h(e), P = !0) : V(e) ? (y = !0, P = e.some((I) => /* @__PURE__ */ pt(I) || /* @__PURE__ */ Re(I)), _ = () => e.map((I) => {
    if (/* @__PURE__ */ ke(I))
      return I.value;
    if (/* @__PURE__ */ pt(I))
      return h(I);
    if (W(I))
      return f ? f(I, 2) : I();
  })) : W(e) ? t ? _ = f ? () => f(e, 2) : e : _ = () => {
    if (A) {
      Xe();
      try {
        A();
      } finally {
        Ze();
      }
    }
    const I = bt;
    bt = d;
    try {
      return f ? f(e, 3, [w]) : e(w);
    } finally {
      bt = I;
    }
  } : _ = Ye, t && i) {
    const I = _, re = i === !0 ? 1 / 0 : i;
    _ = () => at(I(), re);
  }
  const F = El(), U = () => {
    d.stop(), F && F.active && cn(F.effects, d);
  };
  if (l && t) {
    const I = t;
    t = (...re) => {
      try {
        return I(...re);
      } finally {
        U();
      }
    };
  }
  let q = y ? new Array(e.length).fill(is) : is;
  const L = (I) => {
    if (!(!(d.flags & 1) || !d.dirty && !I))
      if (t) {
        const re = d.run();
        if (I || i || P || (y ? re.some((D, R) => Je(D, q[R])) : Je(re, q))) {
          const D = bt;
          Xe();
          try {
            A && A(), bt = d;
            const R = [
              re,
              // pass undefined as the old value when it's changed for the first time
              q === is ? void 0 : y && q[0] === is ? [] : q,
              w
            ];
            q = re, f ? f(t, 3, R) : (
              // @ts-expect-error
              t(...R)
            );
          } finally {
            bt = D, Ze();
          }
        }
      } else
        d.run();
  };
  return a && a(L), d = new _i(_), d.scheduler = o ? () => o(L, !1) : L, w = (I) => er(I, !1, d), A = d.onStop = () => {
    const I = ds.get(d);
    if (I) {
      if (f)
        f(I, 4);
      else
        for (const re of I) re();
      ds.delete(d);
    }
  }, t ? n ? L(!0) : q = d.run() : o ? o(L.bind(null, !0), !0) : d.run(), U.pause = d.pause.bind(d), U.resume = d.resume.bind(d), U.stop = U, U;
}
function at(e, t = 1 / 0, s) {
  if (t <= 0 || !Z(e) || e.__v_skip || (s = s || /* @__PURE__ */ new Map(), (s.get(e) || 0) >= t))
    return e;
  if (s.set(e, t), t--, /* @__PURE__ */ ke(e))
    at(e.value, t, s);
  else if (V(e))
    for (let n = 0; n < e.length; n++)
      at(e[n], t, s);
  else if (fs(e) || ht(e))
    e.forEach((n) => {
      at(n, t, s);
    });
  else if (di(e)) {
    for (const n in e)
      at(e[n], t, s);
    for (const n of Object.getOwnPropertySymbols(e))
      Object.prototype.propertyIsEnumerable.call(e, n) && at(e[n], t, s);
  }
  return e;
}
function es(e, t, s, n) {
  try {
    return n ? e(...n) : e();
  } catch (i) {
    Ts(i, t, s);
  }
}
function Be(e, t, s, n) {
  if (W(e)) {
    const i = es(e, t, s, n);
    return i && ci(i) && i.catch((l) => {
      Ts(l, t, s);
    }), i;
  }
  if (V(e)) {
    const i = [];
    for (let l = 0; l < e.length; l++)
      i.push(Be(e[l], t, s, n));
    return i;
  }
}
function Ts(e, t, s, n = !0) {
  const i = t ? t.vnode : null, { errorHandler: l, throwUnhandledErrorInProduction: o } = t && t.appContext.config || ie;
  if (t) {
    let a = t.parent;
    const f = t.proxy, h = `https://vuejs.org/error-reference/#runtime-${s}`;
    for (; a; ) {
      const d = a.ec;
      if (d) {
        for (let _ = 0; _ < d.length; _++)
          if (d[_](e, f, h) === !1)
            return;
      }
      a = a.parent;
    }
    if (l) {
      Xe(), es(l, null, 10, [
        e,
        f,
        h
      ]), Ze();
      return;
    }
  }
  sr(e, s, i, n, o);
}
function sr(e, t, s, n = !0, i = !1) {
  if (i)
    throw e;
  console.error(e);
}
const $e = [];
let Fe = -1;
const Ge = [];
let ft = null, Tt = 0;
const Ri = /* @__PURE__ */ Promise.resolve();
let hs = null;
function nr(e) {
  const t = hs || Ri;
  return e ? t.then(this ? e.bind(this) : e) : t;
}
function ir(e) {
  let t = Fe + 1, s = $e.length;
  for (; t < s; ) {
    const n = t + s >>> 1, i = $e[n], l = zt(i);
    l < e || l === e && i.flags & 2 ? t = n + 1 : s = n;
  }
  return t;
}
function xn(e) {
  if (!(e.flags & 1)) {
    const t = zt(e), s = $e[$e.length - 1];
    !s || // fast path when the job id is larger than the tail
    !(e.flags & 2) && t >= zt(s) ? $e.push(e) : $e.splice(ir(t), 0, e), e.flags |= 1, Pi();
  }
}
function Pi() {
  hs || (hs = Ri.then(Li));
}
function lr(e) {
  if (!V(e))
    ft && e.id === -1 ? ft.splice(Tt + 1, 0, e) : e.flags & 1 || (Ge.push(e), e.flags |= 1);
  else
    for (let t = 0; t < e.length; t++)
      Ge.push(e[t]);
  Pi();
}
function Fi(e, t, s, n = Fe + 1) {
  for (; n < $e.length; n++) {
    const i = $e[n];
    if (i && i.flags & 2) {
      if (e && i.id !== e.uid || t !== void 0 && !(i.id >= t))
        continue;
      $e.splice(n, 1), n = e ? n - 1 : Fe, i.flags & 4 && (i.flags &= -2), i(), i.flags & 4 || (i.flags &= -2);
    }
  }
}
function Di(e, t, s = 0) {
  if (Ge.length) {
    let n = Ge, i = 0;
    if (t) {
      n = [];
      for (let o = 0; o < Ge.length; o++) {
        const a = Ge[o];
        (a.i !== void 0 ? !a.i || a.i.uid < s : t.has(a)) ? Ge[i++] = a : n.push(a);
      }
    }
    const l = [...new Set(n)].sort((o, a) => zt(o) - zt(a));
    if (Ge.length = i, ft) {
      for (let o = 0; o < l.length; o++)
        ft.push(l[o]);
      return;
    }
    for (ft = l, Tt = 0; Tt < ft.length; Tt++) {
      const o = ft[Tt];
      o.flags & 4 && (o.flags &= -2), o.flags & 8 || o(), o.flags &= -2;
    }
    ft = null, Tt = 0;
  }
}
let Hs = !1;
function rr(e, t) {
  if (Hs) {
    e();
    return;
  }
  const s = t === void 0 ? void 0 : new Set(Ge);
  e(), Hs = !0;
  try {
    Fi(void 0, t), Di(void 0, s, t);
  } finally {
    Hs = !1;
  }
}
const zt = (e) => e.id == null ? e.flags & 2 ? -1 : 1 / 0 : e.id;
function Li(e) {
  try {
    for (Fe = 0; Fe < $e.length; Fe++) {
      const t = $e[Fe];
      t && !(t.flags & 8) && (t.flags & 4 && (t.flags &= -2), es(
        t,
        t.i,
        t.i ? 15 : 14
      ), t.flags & 4 || (t.flags &= -2));
    }
  } finally {
    for (; Fe < $e.length; Fe++) {
      const t = $e[Fe];
      t && (t.flags &= -2);
    }
    Fe = -1, $e.length = 0, Di(), hs = null, ($e.length || Ge.length) && Li();
  }
}
let Oe = null, Bi = null;
function ps(e) {
  const t = Oe;
  return Oe = e, Bi = e && e.type.__scopeId || null, t;
}
function or(e, t = Oe, s) {
  if (!t || e._n)
    return e;
  const n = (...i) => {
    n._d && _s(-1);
    const l = ps(t), o = wt.length;
    let a;
    try {
      a = e(...i);
    } finally {
      for (let f = wt.length; f > o; f--) ul();
      ps(l), n._d && _s(1);
    }
    return a;
  };
  return n._n = !0, n._c = !0, n._d = !0, n;
}
function Us(e, t) {
  if (Oe === null)
    return e;
  const s = Os(Oe), n = e.dirs || (e.dirs = []);
  for (let i = 0; i < t.length; i++) {
    let [l, o, a, f = ie] = t[i];
    l && (W(l) && (l = {
      mounted: l,
      updated: l
    }), l.deep && at(o), n.push({
      dir: l,
      instance: s,
      value: o,
      oldValue: void 0,
      arg: a,
      modifiers: f
    }));
  }
  return e;
}
function vt(e, t, s, n) {
  const i = e.dirs, l = t && t.dirs;
  for (let o = 0; o < i.length; o++) {
    const a = i[o];
    l && (a.oldValue = l[o].value);
    let f = a.dir[n];
    f && (Xe(), Be(f, s, 8, [
      e.el,
      a,
      e,
      t
    ]), Ze());
  }
}
function ar(e, t) {
  if (Ce) {
    let s = Ce.provides;
    const n = Ce.parent && Ce.parent.provides;
    n === s && (s = Ce.provides = Object.create(n)), s[e] = t;
  }
}
function us(e, t, s = !1) {
  const n = io();
  if (n || Et) {
    let i = Et ? Et._context.provides : n ? n.parent == null || n.ce ? n.vnode.appContext && n.vnode.appContext.provides : n.parent.provides : void 0;
    if (i && e in i)
      return i[e];
    if (arguments.length > 1)
      return s && W(t) ? t.call(n && n.proxy) : t;
  }
}
const ur = /* @__PURE__ */ Symbol.for("v-scx"), cr = () => us(ur);
function kt(e, t, s) {
  return Hi(e, t, s);
}
function Hi(e, t, s = ie) {
  const { immediate: n, deep: i, flush: l, once: o } = s, a = ye({}, s), f = t && n || !t && l !== "post";
  let h;
  if (Xt) {
    if (l === "sync") {
      const w = cr();
      h = w.__watcherHandles || (w.__watcherHandles = []);
    } else if (!f) {
      const w = () => {
      };
      return w.stop = Ye, w.resume = Ye, w.pause = Ye, w;
    }
  }
  const d = Ce;
  a.call = (w, P, y) => Be(w, d, P, y);
  let _ = !1;
  l === "post" ? a.scheduler = (w) => {
    w.i = d, Me(w, d && d.suspense);
  } : l !== "sync" && (_ = !0, a.scheduler = (w, P) => {
    P ? w() : xn(w);
  }), a.augmentJob = (w) => {
    t && (w.flags |= 4), _ && (w.flags |= 2, d && (w.id = d.uid, w.i = d));
  };
  const A = tr(e, t, a);
  return Xt && (h ? h.push(A) : f && A()), A;
}
function fr(e, t, s) {
  const n = this.proxy, i = ce(e) ? e.includes(".") ? Ui(n, e) : () => n[e] : e.bind(n, n);
  let l;
  W(t) ? l = t : (l = t.handler, s = t);
  const o = ts(this), a = Hi(i, l.bind(n), s);
  return o(), a;
}
function Ui(e, t) {
  const s = t.split(".");
  return () => {
    let n = e;
    for (let i = 0; i < s.length && n; i++)
      n = n[s[i]];
    return n;
  };
}
const dr = /* @__PURE__ */ Symbol("_vte"), Ms = (e) => e.__isTeleport, js = /* @__PURE__ */ Symbol("_leaveCb");
function hr(e) {
  let t = e[0];
  if (e.length > 1) {
    for (const s of e)
      if (s.type !== He) {
        t = s;
        break;
      }
  }
  return t;
}
function ji(e) {
  if (!kn(e))
    return Ms(e.type) && e.children ? hr(e.children) : e;
  if (e.component)
    return e.component.subTree;
  const { shapeFlag: t, children: s } = e;
  if (s) {
    if (t & 16)
      return s[0];
    if (t & 32 && W(s.default))
      return s.default();
  }
}
function gs(e, t) {
  if (e.shapeFlag & 6 && e.component) {
    e.transition = t;
    const s = e.component.subTree;
    gs(
      Ms(s.type) && ji(s) || s,
      t
    );
  } else if (e.shapeFlag & 128)
    e.ssContent.transition = t.clone(e.ssContent), e.ssFallback.transition = t.clone(e.ssFallback);
  else if (e.transition = t, e.type === j && V(e.children)) {
    const s = Yi(e.children, !1);
    s && gs(s, t);
  }
}
function tn(e) {
  if (e.component)
    return tn(e.component.subTree);
  if (e.type === j) {
    const t = V(e.children) && Yi(e.children, !1);
    return t ? tn(t) : void 0;
  }
  if (e.type !== He)
    return e;
}
// @__NO_SIDE_EFFECTS__
function Es(e, t) {
  return W(e) ? (
    // #8236: extend call and options.name access are considered side-effects
    // by Rollup, so we have to wrap it in a pure-annotated IIFE.
    ye({ name: e.name }, t, { setup: e })
  ) : e;
}
function Vi(e) {
  e.ids = [e.ids[0] + e.ids[2]++ + "-", 0, 0];
}
function Dn(e, t) {
  let s;
  return !!((s = Object.getOwnPropertyDescriptor(e, t)) && !s.configurable);
}
const ms = /* @__PURE__ */ new WeakMap();
function Vt(e, t, s, n, i = !1) {
  if (V(e)) {
    e.forEach(
      (y, F) => Vt(
        y,
        t && (V(t) ? t[F] : t),
        s,
        n,
        i
      )
    );
    return;
  }
  if (Kt(n) && !i) {
    n.shapeFlag & 512 && n.type.__asyncResolved && n.component.subTree.component && Vt(e, t, s, n.component.subTree);
    return;
  }
  const l = n.shapeFlag & 4 ? Os(n.component) : n.el, o = i ? null : l, { i: a, r: f } = e, h = t && t.r, d = a.refs === ie ? a.refs = {} : a.refs, _ = a.setupState, A = /* @__PURE__ */ Q(_), w = _ === ie ? ui : (y) => Dn(d, y) ? !1 : J(A, y), P = (y, F) => !(F && Dn(d, F));
  if (h != null && h !== f) {
    if (Ln(t), ce(h))
      d[h] = null, w(h) && (_[h] = null);
    else if (/* @__PURE__ */ ke(h)) {
      const y = t;
      P(h, y.k) && (h.value = null), y.k && (d[y.k] = null);
    }
  }
  if (W(f))
    es(f, a, 12, [o, d]);
  else {
    const y = ce(f), F = /* @__PURE__ */ ke(f);
    if (y || F) {
      const U = () => {
        if (e.f) {
          const q = y ? w(f) ? _[f] : d[f] : P() || !e.k ? f.value : d[e.k];
          if (i)
            V(q) && cn(q, l);
          else if (V(q))
            q.includes(l) || q.push(l);
          else if (y)
            d[f] = [l], w(f) && (_[f] = d[f]);
          else {
            const L = [l];
            P(f, e.k) && (f.value = L), e.k && (d[e.k] = L);
          }
        } else y ? (d[f] = o, w(f) && (_[f] = o)) : F && (P(f, e.k) && (f.value = o), e.k && (d[e.k] = o));
      };
      if (o) {
        const q = () => {
          U(), ms.delete(e);
        };
        q.id = -1, ms.set(e, q), Me(q, s);
      } else
        Ln(e), U();
    }
  }
}
function Ln(e) {
  const t = ms.get(e);
  t && (t.flags |= 8, ms.delete(e));
}
$s().requestIdleCallback;
$s().cancelIdleCallback;
const Kt = (e) => !!e.type.__asyncLoader, kn = (e) => e.type.__isKeepAlive;
function pr(e, t) {
  Ki(e, "a", t);
}
function gr(e, t) {
  Ki(e, "da", t);
}
function Ki(e, t, s = Ce) {
  const n = e.__wdc || (e.__wdc = () => {
    let i = s;
    for (; i; ) {
      if (i.isDeactivated)
        return;
      i = i.parent;
    }
    return e();
  });
  if (Is(t, n, s), s) {
    let i = s.parent;
    for (; i && i.parent; )
      kn(i.parent.vnode) && mr(n, t, s, i), i = i.parent;
  }
}
function mr(e, t, s, n) {
  const i = Is(
    t,
    e,
    n,
    !0
    /* prepend */
  );
  wn(() => {
    cn(n[t], i);
  }, s);
}
function Is(e, t, s = Ce, n = !1) {
  if (s) {
    const i = s[e] || (s[e] = []), l = t.__weh || (t.__weh = (...o) => {
      Xe();
      const a = ts(s), f = Be(t, s, e, o);
      return a(), Ze(), f;
    });
    return n ? i.unshift(l) : i.push(l), l;
  }
}
const ut = (e) => (t, s = Ce) => {
  (!Xt || e === "sp") && Is(e, (...n) => t(...n), s);
}, vr = ut("bm"), Wi = ut("m"), _r = ut(
  "bu"
), br = ut("u"), yr = ut(
  "bum"
), wn = ut("um"), xr = ut(
  "sp"
), kr = ut("rtg"), wr = ut("rtc");
function $r(e, t = Ce) {
  Is("ec", e, t);
}
const Sr = /* @__PURE__ */ Symbol.for("v-ndc");
function ne(e, t, s, n) {
  let i;
  const l = s, o = V(e);
  if (o || ce(e)) {
    const a = o && /* @__PURE__ */ pt(e);
    let f = !1, h = !1;
    a && (f = !/* @__PURE__ */ Re(e), h = /* @__PURE__ */ et(e), e = Cs(e)), i = new Array(e.length);
    for (let d = 0, _ = e.length; d < _; d++)
      i[d] = t(
        f ? h ? gt(Pe(e[d])) : Pe(e[d]) : e[d],
        d,
        void 0,
        l
      );
  } else if (typeof e == "number")
    if (!Number.isInteger(e) || e < 0)
      i = [];
    else {
      i = new Array(e);
      for (let a = 0; a < e; a++)
        i[a] = t(a + 1, a, void 0, l);
    }
  else if (Z(e))
    if (e[Symbol.iterator])
      i = Array.from(
        e,
        (a, f) => t(a, f, void 0, l)
      );
    else {
      const a = Object.keys(e);
      i = new Array(a.length);
      for (let f = 0, h = a.length; f < h; f++) {
        const d = a[f];
        i[f] = t(e[d], d, f, l);
      }
    }
  else
    i = [];
  return i;
}
const sn = (e) => e ? hl(e) ? Os(e) : sn(e.parent) : null, Wt = (
  // Move PURE marker to new line to workaround compiler discarding it
  // due to type annotation
  /* @__PURE__ */ ye(/* @__PURE__ */ Object.create(null), {
    $: (e) => e,
    $el: (e) => e.vnode.el,
    $data: (e) => e.data,
    $props: (e) => e.props,
    $attrs: (e) => e.attrs,
    $slots: (e) => e.slots,
    $refs: (e) => e.refs,
    $parent: (e) => sn(e.parent),
    $root: (e) => sn(e.root),
    $host: (e) => e.ce,
    $emit: (e) => e.emit,
    $options: (e) => Gi(e),
    $forceUpdate: (e) => e.f || (e.f = () => {
      xn(e.update);
    }),
    $nextTick: (e) => e.n || (e.n = nr.bind(e.proxy)),
    $watch: (e) => fr.bind(e)
  })
), Vs = (e, t) => e !== ie && !e.__isScriptSetup && J(e, t), Cr = {
  get({ _: e }, t) {
    if (t === "__v_skip")
      return !0;
    const { ctx: s, setupState: n, data: i, props: l, accessCache: o, type: a, appContext: f } = e;
    if (t[0] !== "$") {
      const A = o[t];
      if (A !== void 0)
        switch (A) {
          case 1:
            return n[t];
          case 2:
            return i[t];
          case 4:
            return s[t];
          case 3:
            return l[t];
        }
      else {
        if (Vs(n, t))
          return o[t] = 1, n[t];
        if (i !== ie && J(i, t))
          return o[t] = 2, i[t];
        if (J(l, t))
          return o[t] = 3, l[t];
        if (s !== ie && J(s, t))
          return o[t] = 4, s[t];
        nn && (o[t] = 0);
      }
    }
    const h = Wt[t];
    let d, _;
    if (h)
      return t === "$attrs" && xe(e.attrs, "get", ""), h(e);
    if (
      // css module (injected by vue-loader)
      (d = a.__cssModules) && (d = d[t])
    )
      return d;
    if (s !== ie && J(s, t))
      return o[t] = 4, s[t];
    if (
      // global properties
      _ = f.config.globalProperties, J(_, t)
    )
      return _[t];
  },
  set({ _: e }, t, s) {
    const { data: n, setupState: i, ctx: l } = e;
    return Vs(i, t) ? (i[t] = s, !0) : n !== ie && J(n, t) ? (n[t] = s, !0) : J(e.props, t) || t[0] === "$" && t.slice(1) in e ? !1 : (l[t] = s, !0);
  },
  has({
    _: { data: e, setupState: t, accessCache: s, ctx: n, appContext: i, props: l, type: o }
  }, a) {
    let f;
    return !!(s[a] || e !== ie && a[0] !== "$" && J(e, a) || Vs(t, a) || J(l, a) || J(n, a) || J(Wt, a) || J(i.config.globalProperties, a) || (f = o.__cssModules) && f[a]);
  },
  defineProperty(e, t, s) {
    return s.get != null ? e._.accessCache[t] = 0 : J(s, "value") && this.set(e, t, s.value, null), Reflect.defineProperty(e, t, s);
  }
};
function Bn(e) {
  return V(e) ? e.reduce(
    (t, s) => (t[s] = null, t),
    {}
  ) : e;
}
let nn = !0;
function Tr(e) {
  const t = Gi(e), s = e.proxy, n = e.ctx;
  nn = !1, t.beforeCreate && Hn(t.beforeCreate, e, "bc");
  const {
    // state
    data: i,
    computed: l,
    methods: o,
    watch: a,
    provide: f,
    inject: h,
    // lifecycle
    created: d,
    beforeMount: _,
    mounted: A,
    beforeUpdate: w,
    updated: P,
    activated: y,
    deactivated: F,
    beforeDestroy: U,
    beforeUnmount: q,
    destroyed: L,
    unmounted: I,
    render: re,
    renderTracked: D,
    renderTriggered: R,
    errorCaptured: S,
    serverPrefetch: he,
    // public API
    expose: oe,
    inheritAttrs: tt,
    // assets
    components: st,
    directives: ct,
    filters: ge
  } = t;
  if (h && Mr(h, n, null), o)
    for (const ee in o) {
      const Y = o[ee];
      W(Y) && (n[ee] = Y.bind(s));
    }
  if (i) {
    const ee = i.call(s, s);
    Z(ee) && (e.data = /* @__PURE__ */ _n(ee));
  }
  if (nn = !0, l)
    for (const ee in l) {
      const Y = l[ee], nt = W(Y) ? Y.bind(s, s) : W(Y.get) ? Y.get.bind(s, s) : Ye, St = !W(Y) && W(Y.set) ? Y.set.bind(s) : Ye, Ue = ue({
        get: nt,
        set: St
      });
      Object.defineProperty(n, ee, {
        enumerable: !0,
        configurable: !0,
        get: () => Ue.value,
        set: (Ee) => Ue.value = Ee
      });
    }
  if (a)
    for (const ee in a)
      qi(a[ee], n, s, ee);
  if (f) {
    const ee = W(f) ? f.call(s) : f;
    Reflect.ownKeys(ee).forEach((Y) => {
      ar(Y, ee[Y]);
    });
  }
  d && Hn(d, e, "c");
  function ae(ee, Y) {
    V(Y) ? Y.forEach((nt) => ee(nt.bind(s))) : Y && ee(Y.bind(s));
  }
  if (ae(vr, _), ae(Wi, A), ae(_r, w), ae(br, P), ae(pr, y), ae(gr, F), ae($r, S), ae(wr, D), ae(kr, R), ae(yr, q), ae(wn, I), ae(xr, he), V(oe))
    if (oe.length) {
      const ee = e.exposed || (e.exposed = {});
      oe.forEach((Y) => {
        Object.defineProperty(ee, Y, {
          get: () => s[Y],
          set: (nt) => s[Y] = nt,
          enumerable: !0
        });
      });
    } else e.exposed || (e.exposed = {});
  re && e.render === Ye && (e.render = re), tt != null && (e.inheritAttrs = tt), st && (e.components = st), ct && (e.directives = ct), he && Vi(e);
}
function Mr(e, t, s = Ye) {
  V(e) && (e = ln(e));
  for (const n in e) {
    const i = e[n];
    let l;
    Z(i) ? "default" in i ? l = us(
      i.from || n,
      i.default,
      !0
    ) : l = us(i.from || n) : l = us(i), /* @__PURE__ */ ke(l) ? Object.defineProperty(t, n, {
      enumerable: !0,
      configurable: !0,
      get: () => l.value,
      set: (o) => l.value = o
    }) : t[n] = l;
  }
}
function Hn(e, t, s) {
  Be(
    V(e) ? e.map((n) => n.bind(t.proxy)) : e.bind(t.proxy),
    t,
    s
  );
}
function qi(e, t, s, n) {
  let i = n.includes(".") ? Ui(s, n) : () => s[n];
  if (ce(e)) {
    const l = t[e];
    W(l) && kt(i, l);
  } else if (W(e))
    kt(i, e.bind(s));
  else if (Z(e))
    if (V(e))
      e.forEach((l) => qi(l, t, s, n));
    else {
      const l = W(e.handler) ? e.handler.bind(s) : t[e.handler];
      W(l) && kt(i, l, e);
    }
}
function Gi(e) {
  const t = e.type, { mixins: s, extends: n } = t, {
    mixins: i,
    optionsCache: l,
    config: { optionMergeStrategies: o }
  } = e.appContext, a = l.get(t);
  let f;
  return a ? f = a : !i.length && !s && !n ? f = t : (f = {}, i.length && i.forEach(
    (h) => vs(f, h, o, !0)
  ), vs(f, t, o)), Z(t) && l.set(t, f), f;
}
function vs(e, t, s, n = !1) {
  const { mixins: i, extends: l } = t;
  l && vs(e, l, s, !0), i && i.forEach(
    (o) => vs(e, o, s, !0)
  );
  for (const o in t)
    if (!(n && o === "expose")) {
      const a = Er[o] || s && s[o];
      e[o] = a ? a(e[o], t[o]) : t[o];
    }
  return e;
}
const Er = {
  data: Un,
  props: jn,
  emits: jn,
  // objects
  methods: Lt,
  computed: Lt,
  // lifecycle
  beforeCreate: we,
  created: we,
  beforeMount: we,
  mounted: we,
  beforeUpdate: we,
  updated: we,
  beforeDestroy: we,
  beforeUnmount: we,
  destroyed: we,
  unmounted: we,
  activated: we,
  deactivated: we,
  errorCaptured: we,
  serverPrefetch: we,
  // assets
  components: Lt,
  directives: Lt,
  // watch
  watch: Ar,
  // provide / inject
  provide: Un,
  inject: Ir
};
function Un(e, t) {
  return t ? e ? function() {
    return ye(
      W(e) ? e.call(this, this) : e,
      W(t) ? t.call(this, this) : t
    );
  } : t : e;
}
function Ir(e, t) {
  return Lt(ln(e), ln(t));
}
function ln(e) {
  if (V(e)) {
    const t = {};
    for (let s = 0; s < e.length; s++)
      t[e[s]] = e[s];
    return t;
  }
  return e;
}
function we(e, t) {
  return e ? [...new Set([].concat(e, t))] : t;
}
function Lt(e, t) {
  return e ? ye(/* @__PURE__ */ Object.create(null), e, t) : t;
}
function jn(e, t) {
  return e ? V(e) && V(t) ? [.../* @__PURE__ */ new Set([...e, ...t])] : ye(
    /* @__PURE__ */ Object.create(null),
    Bn(e),
    Bn(t ?? {})
  ) : t;
}
function Ar(e, t) {
  if (!e) return t;
  if (!t) return e;
  const s = ye(/* @__PURE__ */ Object.create(null), e);
  for (const n in t)
    s[n] = we(e[n], t[n]);
  return s;
}
function zi() {
  return {
    app: null,
    config: {
      isNativeTag: ui,
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
let Nr = 0;
function Or(e, t) {
  return function(n, i = null) {
    W(n) || (n = ye({}, n)), i != null && !Z(i) && (i = null);
    const l = zi(), o = /* @__PURE__ */ new WeakSet(), a = [];
    let f = !1;
    const h = l.app = {
      _uid: Nr++,
      _component: n,
      _props: i,
      _container: null,
      _context: l,
      _instance: null,
      version: fo,
      get config() {
        return l.config;
      },
      set config(d) {
      },
      use(d, ..._) {
        return o.has(d) || (d && W(d.install) ? (o.add(d), d.install(h, ..._)) : W(d) && (o.add(d), d(h, ..._))), h;
      },
      mixin(d) {
        return l.mixins.includes(d) || l.mixins.push(d), h;
      },
      component(d, _) {
        return _ ? (l.components[d] = _, h) : l.components[d];
      },
      directive(d, _) {
        return _ ? (l.directives[d] = _, h) : l.directives[d];
      },
      mount(d, _, A) {
        if (!f) {
          const w = h._ceVNode || Ne(n, i);
          return w.appContext = l, A === !0 ? A = "svg" : A === !1 && (A = void 0), e(w, d, A), f = !0, h._container = d, d.__vue_app__ = h, Os(w.component);
        }
      },
      onUnmount(d) {
        a.push(d);
      },
      unmount() {
        f && (Be(
          a,
          h._instance,
          16
        ), e(null, h._container), delete h._container.__vue_app__);
      },
      provide(d, _) {
        return l.provides[d] = _, h;
      },
      runWithContext(d) {
        const _ = Et;
        Et = h;
        try {
          return d();
        } finally {
          Et = _;
        }
      }
    };
    return h;
  };
}
let Et = null;
const Rr = (e, t) => t === "modelValue" || t === "model-value" ? e.modelModifiers : e[`${t}Modifiers`] || e[`${De(t)}Modifiers`] || e[`${$t(t)}Modifiers`];
function Pr(e, t, ...s) {
  if (e.isUnmounted) return;
  const n = e.vnode.props || ie;
  let i = s;
  const l = t.startsWith("update:"), o = l && Rr(n, t.slice(7));
  o && (o.trim && (i = s.map((d) => ce(d) ? d.trim() : d)), o.number && (i = i.map(dn)));
  let a, f = n[a = Ps(t)] || // also try camelCase event handler (#2249)
  n[a = Ps(De(t))];
  !f && l && (f = n[a = Ps($t(t))]), f && Be(
    f,
    e,
    6,
    i
  );
  const h = n[a + "Once"];
  if (h) {
    if (!e.emitted)
      e.emitted = {};
    else if (e.emitted[a])
      return;
    e.emitted[a] = !0, Be(
      h,
      e,
      6,
      i
    );
  }
}
const Fr = /* @__PURE__ */ new WeakMap();
function Ji(e, t, s = !1) {
  const n = s ? Fr : t.emitsCache, i = n.get(e);
  if (i !== void 0)
    return i;
  const l = e.emits;
  let o = {}, a = !1;
  if (!W(e)) {
    const f = (h) => {
      const d = Ji(h, t, !0);
      d && (a = !0, ye(o, d));
    };
    !s && t.mixins.length && t.mixins.forEach(f), e.extends && f(e.extends), e.mixins && e.mixins.forEach(f);
  }
  return !l && !a ? (Z(e) && n.set(e, null), null) : (V(l) ? l.forEach((f) => o[f] = null) : ye(o, l), Z(e) && n.set(e, o), o);
}
function As(e, t) {
  return !e || !xs(t) ? !1 : (t = t.slice(2), t = t === "Once" ? t : t.replace(/Once$/, ""), J(e, t[0].toLowerCase() + t.slice(1)) || J(e, $t(t)) || J(e, t));
}
function Vn(e) {
  const {
    type: t,
    vnode: s,
    proxy: n,
    withProxy: i,
    propsOptions: [l],
    slots: o,
    attrs: a,
    emit: f,
    render: h,
    renderCache: d,
    props: _,
    data: A,
    setupState: w,
    ctx: P,
    inheritAttrs: y
  } = e, F = ps(e);
  let U, q;
  try {
    if (s.shapeFlag & 4) {
      const I = i || n, re = I;
      U = ze(
        h.call(
          re,
          I,
          d,
          _,
          w,
          A,
          P
        )
      ), q = a;
    } else {
      const I = t;
      U = ze(
        I.length > 1 ? I(
          _,
          { attrs: a, slots: o, emit: f }
        ) : I(
          _,
          null
        )
      ), q = t.props ? a : Dr(a);
    }
  } catch (I) {
    wt.length = 0, Ts(I, e, 1), U = Ne(He);
  }
  let L = U;
  if (q && y !== !1) {
    const I = Object.keys(q), { shapeFlag: re } = L;
    I.length && re & 7 && (l && I.some(ks) && (q = Lr(
      q,
      l
    )), L = It(L, q, !1, !0));
  }
  if (s.dirs && (L = It(L, null, !1, !0), L.dirs = L.dirs ? L.dirs.concat(s.dirs) : s.dirs), s.transition) {
    const I = Ms(L.type) && ji(L) || L;
    gs(I, s.transition);
  }
  return U = L, ps(F), U;
}
function Yi(e, t = !0) {
  let s;
  for (let n = 0; n < e.length; n++) {
    const i = e[n];
    if (Yt(i)) {
      if (i.type !== He || i.children === "v-if") {
        if (s)
          return;
        s = i;
      }
    } else
      return;
  }
  return s;
}
const Dr = (e) => {
  let t;
  for (const s in e)
    (s === "class" || s === "style" || xs(s)) && ((t || (t = {}))[s] = e[s]);
  return t;
}, Lr = (e, t) => {
  const s = {};
  for (const n in e)
    (!ks(n) || !(n.slice(9) in t)) && (s[n] = e[n]);
  return s;
};
function Br(e, t, s) {
  const { props: n, children: i, component: l } = e, { props: o, children: a, patchFlag: f } = t, h = l.emitsOptions;
  if (t.dirs || t.transition)
    return !0;
  if (s && f >= 0) {
    if (f & 1024)
      return !0;
    if (f & 16)
      return n ? Kn(n, o, h) : !!o;
    if (f & 8) {
      const d = t.dynamicProps;
      for (let _ = 0; _ < d.length; _++) {
        const A = d[_];
        if (Qi(o, n, A) && !As(h, A))
          return !0;
      }
    }
  } else
    return (i || a) && (!a || !a.$stable) ? !0 : n === o ? !1 : n ? o ? Kn(n, o, h) : !0 : !!o;
  return !1;
}
function Kn(e, t, s) {
  const n = Object.keys(t);
  if (n.length !== Object.keys(e).length)
    return !0;
  for (let i = 0; i < n.length; i++) {
    const l = n[i];
    if (!J(e, l) || Qi(t, e, l) && !As(s, l))
      return !0;
  }
  return !1;
}
function Qi(e, t, s) {
  const n = e[s], i = t[s];
  return s === "style" && Z(n) && Z(i) ? !Ss(n, i) : n !== i;
}
function Hr({ vnode: e, parent: t, suspense: s }, n) {
  for (; t; ) {
    const i = t.subTree;
    if (i.suspense && i.suspense.activeBranch === e && (i.suspense.vnode.el = i.el = n, e = i), i === e)
      (e = t.vnode).el = n, t = t.parent;
    else
      break;
  }
  s && s.activeBranch === e && (s.vnode.el = n);
}
const Xi = {}, Zi = () => Object.create(Xi), el = (e) => Object.getPrototypeOf(e) === Xi;
function Ur(e, t, s, n = !1) {
  const i = {}, l = Zi();
  e.propsDefaults = /* @__PURE__ */ Object.create(null), tl(e, t, i, l);
  for (const o in e.propsOptions[0])
    o in i || (i[o] = void 0);
  s ? e.props = n ? i : /* @__PURE__ */ ql(i) : e.type.props ? e.props = i : e.props = l, e.attrs = l;
}
function jr(e, t, s, n) {
  const {
    props: i,
    attrs: l,
    vnode: { patchFlag: o }
  } = e, a = /* @__PURE__ */ Q(i), [f] = e.propsOptions;
  let h = !1;
  if (
    // always force full diff in dev
    // - #1942 if hmr is enabled with sfc component
    // - vite#872 non-sfc component used by sfc component
    (n || o > 0) && !(o & 16)
  ) {
    if (o & 8) {
      const d = e.vnode.dynamicProps;
      for (let _ = 0; _ < d.length; _++) {
        let A = d[_];
        if (As(e.emitsOptions, A))
          continue;
        const w = t[A];
        if (f)
          if (J(l, A))
            w !== l[A] && (l[A] = w, h = !0);
          else {
            const P = De(A);
            i[P] = rn(
              f,
              a,
              P,
              w,
              e,
              !1
            );
          }
        else
          w !== l[A] && (l[A] = w, h = !0);
      }
    }
  } else {
    tl(e, t, i, l) && (h = !0);
    let d;
    for (const _ in a)
      (!t || // for camelCase
      !J(t, _) && // it's possible the original props was passed in as kebab-case
      // and converted to camelCase (#955)
      ((d = $t(_)) === _ || !J(t, d))) && (f ? s && // for camelCase
      (s[_] !== void 0 || // for kebab-case
      s[d] !== void 0) && (i[_] = rn(
        f,
        a,
        _,
        void 0,
        e,
        !0
      )) : delete i[_]);
    if (l !== a)
      for (const _ in l)
        (!t || !J(t, _)) && (delete l[_], h = !0);
  }
  h && ot(e.attrs, "set", "");
}
function tl(e, t, s, n) {
  const [i, l] = e.propsOptions;
  let o = !1, a;
  if (t)
    for (let f in t) {
      if (Ht(f))
        continue;
      const h = t[f];
      let d;
      i && J(i, d = De(f)) ? !l || !l.includes(d) ? s[d] = h : (a || (a = {}))[d] = h : As(e.emitsOptions, f) || (!(f in n) || h !== n[f]) && (n[f] = h, o = !0);
    }
  if (l) {
    const f = /* @__PURE__ */ Q(s), h = a || ie;
    for (let d = 0; d < l.length; d++) {
      const _ = l[d];
      s[_] = rn(
        i,
        f,
        _,
        h[_],
        e,
        !J(h, _)
      );
    }
  }
  return o;
}
function rn(e, t, s, n, i, l) {
  const o = e[s];
  if (o != null) {
    const a = J(o, "default");
    if (a && n === void 0) {
      const f = o.default;
      if (o.type !== Function && !o.skipFactory && W(f)) {
        const { propsDefaults: h } = i;
        if (s in h)
          n = h[s];
        else {
          const d = ts(i);
          n = h[s] = f.call(
            null,
            t
          ), d();
        }
      } else
        n = f;
      i.ce && i.ce._setProp(s, n);
    }
    o[
      0
      /* shouldCast */
    ] && (l && !a ? n = !1 : o[
      1
      /* shouldCastTrue */
    ] && (n === "" || n === $t(s)) && (n = !0));
  }
  return n;
}
const Vr = /* @__PURE__ */ new WeakMap();
function sl(e, t, s = !1) {
  const n = s ? Vr : t.propsCache, i = n.get(e);
  if (i)
    return i;
  const l = e.props, o = {}, a = [];
  let f = !1;
  if (!W(e)) {
    const d = (_) => {
      f = !0;
      const [A, w] = sl(_, t, !0);
      ye(o, A), w && a.push(...w);
    };
    !s && t.mixins.length && t.mixins.forEach(d), e.extends && d(e.extends), e.mixins && e.mixins.forEach(d);
  }
  if (!l && !f)
    return Z(e) && n.set(e, yt), yt;
  if (V(l))
    for (let d = 0; d < l.length; d++) {
      const _ = De(l[d]);
      Wn(_) && (o[_] = ie);
    }
  else if (l)
    for (const d in l) {
      const _ = De(d);
      if (Wn(_)) {
        const A = l[d], w = o[_] = V(A) || W(A) ? { type: A } : ye({}, A), P = w.type;
        let y = !1, F = !0;
        if (V(P))
          for (let U = 0; U < P.length; ++U) {
            const q = P[U], L = W(q) && q.name;
            if (L === "Boolean") {
              y = !0;
              break;
            } else L === "String" && (F = !1);
          }
        else
          y = W(P) && P.name === "Boolean";
        w[
          0
          /* shouldCast */
        ] = y, w[
          1
          /* shouldCastTrue */
        ] = F, (y || J(w, "default")) && a.push(_);
      }
    }
  const h = [o, a];
  return Z(e) && n.set(e, h), h;
}
function Wn(e) {
  return e[0] !== "$" && !Ht(e);
}
const $n = (e) => e === "_" || e === "_ctx" || e === "$stable", Sn = (e) => V(e) ? e.map(ze) : [ze(e)], Kr = (e, t, s) => {
  if (t._n)
    return t;
  const n = or((...i) => Sn(t(...i)), s);
  return n._c = !1, n;
}, nl = (e, t, s) => {
  const n = e._ctx;
  for (const i in e) {
    if ($n(i)) continue;
    const l = e[i];
    if (W(l))
      t[i] = Kr(i, l, n);
    else if (l != null) {
      const o = Sn(l);
      t[i] = () => o;
    }
  }
}, il = (e, t) => {
  const s = Sn(t);
  e.slots.default = () => s;
}, ll = (e, t, s) => {
  for (const n in t)
    (s || !$n(n)) && (e[n] = t[n]);
}, Wr = (e, t, s) => {
  const n = e.slots = Zi();
  if (e.vnode.shapeFlag & 32) {
    const i = t._;
    i ? (ll(n, t, s), s && pi(n, "_", i, !0)) : nl(t, n);
  } else t && il(e, t);
}, qr = (e, t, s) => {
  const { vnode: n, slots: i } = e;
  let l = !0, o = ie;
  if (n.shapeFlag & 32) {
    const a = t._;
    a ? s && a === 1 ? l = !1 : ll(i, t, s) : (l = !t.$stable, nl(t, i)), o = t;
  } else t && (il(e, t), o = { default: 1 });
  if (l)
    for (const a in i)
      !$n(a) && o[a] == null && delete i[a];
}, Me = Qr;
function Gr(e) {
  return zr(e);
}
function zr(e, t) {
  const s = $s();
  s.__VUE__ = !0;
  const {
    insert: n,
    remove: i,
    patchProp: l,
    createElement: o,
    createText: a,
    createComment: f,
    setText: h,
    setElementText: d,
    parentNode: _,
    nextSibling: A,
    setScopeId: w = Ye,
    insertStaticContent: P
  } = e, y = (r, u, p, C = null, b = null, k = null, T = void 0, E = null, M = !!u.dynamicChildren) => {
    if (r === u)
      return;
    r && !Ft(r, u) && (C = pe(r), Ee(r, b, k, !0), r = null), u.patchFlag === -2 && (M = !1, u.dynamicChildren = null), u.dynamicChildren && r && r.dynamicChildren && r.dynamicChildren.hasOnce && (u.dynamicChildren === yt && (u.dynamicChildren = []), u.dynamicChildren.hasOnce = !0);
    const { type: x, ref: B, shapeFlag: N } = u;
    switch (x) {
      case Ns:
        F(r, u, p, C);
        break;
      case He:
        U(r, u, p, C);
        break;
      case Ws:
        r == null && q(u, p, C, T);
        break;
      case j:
        st(
          r,
          u,
          p,
          C,
          b,
          k,
          T,
          E,
          M
        );
        break;
      default:
        N & 1 ? re(
          r,
          u,
          p,
          C,
          b,
          k,
          T,
          E,
          M
        ) : N & 6 ? ct(
          r,
          u,
          p,
          C,
          b,
          k,
          T,
          E,
          M
        ) : (N & 64 || N & 128) && x.process(
          r,
          u,
          p,
          C,
          b,
          k,
          T,
          E,
          M,
          O
        );
    }
    B != null && b ? Vt(B, r && r.ref, k, u || r, !u) : B == null && r && r.ref != null && Vt(r.ref, null, k, r, !0);
  }, F = (r, u, p, C) => {
    if (r == null)
      n(
        u.el = a(u.children),
        p,
        C
      );
    else {
      const b = u.el = r.el;
      u.children !== r.children && h(b, u.children);
    }
  }, U = (r, u, p, C) => {
    r == null ? n(
      u.el = f(u.children || ""),
      p,
      C
    ) : u.el = r.el;
  }, q = (r, u, p, C) => {
    [r.el, r.anchor] = P(
      r.children,
      u,
      p,
      C,
      r.el,
      r.anchor
    );
  }, L = ({ el: r, anchor: u }, p, C) => {
    let b;
    for (; r && r !== u; )
      b = A(r), n(r, p, C), r = b;
    n(u, p, C);
  }, I = ({ el: r, anchor: u }) => {
    let p;
    for (; r && r !== u; )
      p = A(r), i(r), r = p;
    i(u);
  }, re = (r, u, p, C, b, k, T, E, M) => {
    if (u.type === "svg" ? T = "svg" : u.type === "math" && (T = "mathml"), r == null)
      D(
        u,
        p,
        C,
        b,
        k,
        T,
        E,
        M
      );
    else {
      const x = r.el && r.el._isVueCE ? r.el : null;
      try {
        x && x._beginPatch(), he(
          r,
          u,
          b,
          k,
          T,
          E,
          M
        );
      } finally {
        x && x._endPatch();
      }
    }
  }, D = (r, u, p, C, b, k, T, E) => {
    let M, x;
    const { props: B, shapeFlag: N, transition: H, dirs: K } = r;
    if (M = r.el = o(
      r.type,
      k,
      B && B.is,
      B
    ), N & 8 ? d(M, r.children) : N & 16 && S(
      r.children,
      M,
      null,
      C,
      b,
      Ks(r, k),
      T,
      E
    ), K && vt(r, null, C, "created"), R(M, r, r.scopeId, T, C), B) {
      for (const se in B)
        se !== "value" && !Ht(se) && l(M, se, null, B[se], k, C);
      "value" in B && l(M, "value", null, B.value, k), (x = B.onVnodeBeforeMount) && We(x, C, r);
    }
    K && vt(r, null, C, "beforeMount");
    const G = Jr(b, H);
    G && H.beforeEnter(M), n(M, u, p), ((x = B && B.onVnodeMounted) || G || K) && Me(() => {
      x && We(x, C, r), G && H.enter(M), K && vt(r, null, C, "mounted");
    }, b);
  }, R = (r, u, p, C, b) => {
    if (p && w(r, p), C)
      for (let k = 0; k < C.length; k++)
        w(r, C[k]);
    if (b) {
      let k = b.subTree;
      if (u === k || al(k.type) && (k.ssContent === u || k.ssFallback === u)) {
        const T = b.vnode;
        R(
          r,
          T,
          T.scopeId,
          T.slotScopeIds,
          b.parent
        );
      }
    }
  }, S = (r, u, p, C, b, k, T, E, M = 0) => {
    for (let x = M; x < r.length; x++) {
      const B = r[x] = E ? rt(r[x]) : ze(r[x]);
      y(
        null,
        B,
        u,
        p,
        C,
        b,
        k,
        T,
        E
      );
    }
  }, he = (r, u, p, C, b, k, T) => {
    const E = u.el = r.el;
    let { patchFlag: M, dynamicChildren: x, dirs: B } = u;
    M |= r.patchFlag & 16;
    const N = r.props || ie, H = u.props || ie;
    let K;
    if (p && _t(p, !1), (K = H.onVnodeBeforeUpdate) && We(K, p, u, r), B && vt(u, r, p, "beforeUpdate"), p && _t(p, !0), // #6385 the old vnode may be a user-wrapped non-isomorphic block
    // Force full diff when block metadata is unstable.
    x && (!r.dynamicChildren || r.dynamicChildren.length !== x.length) && (M = 0, T = !1, x = null), (N.innerHTML && H.innerHTML == null || N.textContent && H.textContent == null) && d(E, ""), x ? oe(
      r.dynamicChildren,
      x,
      E,
      p,
      C,
      Ks(u, b),
      k
    ) : T || Y(
      r,
      u,
      E,
      null,
      p,
      C,
      Ks(u, b),
      k,
      !1
    ), M > 0) {
      if (M & 16)
        tt(E, N, H, p, b);
      else if (M & 2 && N.class !== H.class && l(E, "class", null, H.class, b), M & 4 && l(E, "style", N.style, H.style, b), M & 8) {
        const G = u.dynamicProps;
        for (let se = 0; se < G.length; se++) {
          const te = G[se], de = N[te], me = H[te];
          (me !== de || te === "value") && l(E, te, de, me, b, p);
        }
      }
      M & 1 && r.children !== u.children && d(E, u.children);
    } else !T && x == null && tt(E, N, H, p, b);
    ((K = H.onVnodeUpdated) || B) && Me(() => {
      K && We(K, p, u, r), B && vt(u, r, p, "updated");
    }, C);
  }, oe = (r, u, p, C, b, k, T) => {
    for (let E = 0; E < u.length; E++) {
      const M = r[E], x = u[E], B = M.el || on(M), N = (
        // oldVNode may be an errored async setup() component inside Suspense
        // which will not have a mounted element
        B && // - In the case of a Fragment, we need to provide the actual parent
        // of the Fragment itself so it can move its children.
        (M.type === j || // - In the case of different nodes, there is going to be a replacement
        // which also requires the correct parent container
        !Ft(M, x) || // - In the case of a component, it could contain anything.
        M.shapeFlag & 198) ? _(B) : (
          // In other cases, the parent container is not actually used so we
          // just pass the block element here to avoid a DOM parentNode call.
          p
        )
      );
      y(
        M,
        x,
        N,
        null,
        C,
        b,
        k,
        T,
        !0
      );
    }
  }, tt = (r, u, p, C, b) => {
    if (u !== p) {
      if (u !== ie)
        for (const k in u)
          !Ht(k) && !(k in p) && l(
            r,
            k,
            u[k],
            null,
            b,
            C
          );
      for (const k in p) {
        if (Ht(k)) continue;
        const T = p[k], E = u[k];
        T !== E && k !== "value" && l(r, k, E, T, b, C);
      }
      "value" in p && l(r, "value", u.value, p.value, b);
    }
  }, st = (r, u, p, C, b, k, T, E, M) => {
    const x = u.el = r ? r.el : a(""), B = u.anchor = r ? r.anchor : a("");
    let { patchFlag: N, dynamicChildren: H, slotScopeIds: K } = u;
    K && (E = E ? E.concat(K) : K), r == null ? (n(x, p, C), n(B, p, C), S(
      // #10007
      // such fragment like `<></>` will be compiled into
      // a fragment which doesn't have a children.
      // In this case fallback to an empty array
      u.children || [],
      p,
      B,
      b,
      k,
      T,
      E,
      M
    )) : N > 0 && N & 64 && H && // #2715 the previous fragment could've been a BAILed one as a result
    // of renderSlot() with no valid children
    r.dynamicChildren && r.dynamicChildren.length === H.length ? (oe(
      r.dynamicChildren,
      H,
      p,
      b,
      k,
      T,
      E
    ), // #2080 if the stable fragment has a key, it's a <template v-for> that may
    //  get moved around. Make sure all root level vnodes inherit el.
    // #2134 or if it's a component root, it may also get moved around
    // as the component is being moved.
    (u.key != null || b && u === b.subTree) && rl(
      r,
      u,
      !0
      /* shallow */
    )) : Y(
      r,
      u,
      p,
      B,
      b,
      k,
      T,
      E,
      M
    );
  }, ct = (r, u, p, C, b, k, T, E, M) => {
    u.slotScopeIds = E, r == null ? u.shapeFlag & 512 ? b.ctx.activate(
      u,
      p,
      C,
      T,
      M
    ) : ge(
      u,
      p,
      C,
      b,
      k,
      T,
      M
    ) : z(r, u, M);
  }, ge = (r, u, p, C, b, k, T) => {
    const E = r.component = no(
      r,
      C,
      b
    );
    if (kn(r) && (E.ctx.renderer = O), lo(E, !1, T), E.asyncDep) {
      if (b && b.registerDep(
        E,
        ae,
        T,
        k
      ), !r.el) {
        const M = E.subTree = Ne(He);
        U(null, M, u, p), r.placeholder = M.el;
      }
    } else
      ae(
        E,
        r,
        u,
        p,
        b,
        k,
        T
      );
  }, z = (r, u, p) => {
    const C = u.component = r.component;
    if (Br(r, u, p))
      if (C.asyncDep && !C.asyncResolved) {
        u.el = r.el, u.placeholder = r.placeholder, ee(C, u, p);
        return;
      } else
        C.next = u, C.update();
    else
      u.el = r.el, u.placeholder = r.placeholder, C.vnode = u;
  }, ae = (r, u, p, C, b, k, T) => {
    const E = () => {
      if (r.isMounted) {
        let { next: N, bu: H, u: K, parent: G, vnode: se } = r;
        {
          const Ve = ol(r);
          if (Ve) {
            N && (N.el = se.el, ee(r, N, T)), Ve.asyncDep.then(() => {
              Me(() => {
                r.isUnmounted || x();
              }, b);
            });
            return;
          }
        }
        let te = N, de;
        _t(r, !1), N ? (N.el = se.el, ee(r, N, T)) : N = se, H && as(H), (de = N.props && N.props.onVnodeBeforeUpdate) && We(de, G, N, se), _t(r, !0);
        const me = Vn(r), je = r.subTree;
        r.subTree = me, y(
          je,
          me,
          // parent may have changed if it's in a teleport
          _(je.el),
          // anchor may have changed if it's in a fragment
          pe(je),
          r,
          b,
          k
        ), N.el = me.el, te === null && Hr(r, me.el), K && Me(K, b), (de = N.props && N.props.onVnodeUpdated) && Me(
          () => We(de, G, N, se),
          b
        );
      } else {
        let N;
        const { el: H, props: K } = u, { bm: G, m: se, parent: te, root: de, type: me } = r, je = Kt(u);
        _t(r, !1), G && as(G), !je && (N = K && K.onVnodeBeforeMount) && We(N, te, u), _t(r, !0);
        {
          de.ce && de.ce._hasShadowRoot() && de.ce._injectChildStyle(
            me,
            r.parent ? r.parent.type : void 0
          );
          const Ve = r.subTree = Vn(r);
          y(
            null,
            Ve,
            p,
            C,
            r,
            b,
            k
          ), u.el = Ve.el;
        }
        if (se && Me(se, b), !je && (N = K && K.onVnodeMounted)) {
          const Ve = u;
          Me(
            () => We(N, te, Ve),
            b
          );
        }
        (u.shapeFlag & 256 || te && Kt(te.vnode) && te.vnode.shapeFlag & 256) && r.a && Me(r.a, b), r.isMounted = !0, u = p = C = null;
      }
    };
    r.scope.on();
    const M = r.effect = new _i(E);
    r.scope.off();
    const x = r.update = M.run.bind(M), B = r.job = M.runIfDirty.bind(M);
    B.i = r, B.id = r.uid, M.scheduler = () => xn(B), _t(r, !0), x();
  }, ee = (r, u, p) => {
    u.component = r;
    const C = r.vnode.props;
    r.vnode = u, r.next = null, jr(r, u.props, C, p), qr(r, u.children, p), Xe(), Fi(r), Ze();
  }, Y = (r, u, p, C, b, k, T, E, M = !1) => {
    const x = r && r.children, B = r ? r.shapeFlag : 0, N = u.children, { patchFlag: H, shapeFlag: K } = u;
    if (H > 0) {
      if (H & 128) {
        St(
          x,
          N,
          p,
          C,
          b,
          k,
          T,
          E,
          M
        );
        return;
      } else if (H & 256) {
        nt(
          x,
          N,
          p,
          C,
          b,
          k,
          T,
          E,
          M
        );
        return;
      }
    }
    K & 8 ? (B & 16 && Te(x, b, k), N !== x && d(p, N)) : B & 16 ? K & 16 ? St(
      x,
      N,
      p,
      C,
      b,
      k,
      T,
      E,
      M
    ) : Te(x, b, k, !0) : (B & 8 && d(p, ""), K & 16 && S(
      N,
      p,
      C,
      b,
      k,
      T,
      E,
      M
    ));
  }, nt = (r, u, p, C, b, k, T, E, M) => {
    r = r || yt, u = u || yt;
    const x = r.length, B = u.length, N = Math.min(x, B);
    let H;
    for (H = 0; H < N; H++) {
      const K = u[H] = M ? rt(u[H]) : ze(u[H]);
      y(
        r[H],
        K,
        p,
        null,
        b,
        k,
        T,
        E,
        M
      );
    }
    x > B ? Te(
      r,
      b,
      k,
      !0,
      !1,
      N
    ) : S(
      u,
      p,
      C,
      b,
      k,
      T,
      E,
      M,
      N
    );
  }, St = (r, u, p, C, b, k, T, E, M) => {
    let x = 0;
    const B = u.length;
    let N = r.length - 1, H = B - 1;
    for (; x <= N && x <= H; ) {
      const K = r[x], G = u[x] = M ? rt(u[x]) : ze(u[x]);
      if (Ft(K, G))
        y(
          K,
          G,
          p,
          null,
          b,
          k,
          T,
          E,
          M
        );
      else
        break;
      x++;
    }
    for (; x <= N && x <= H; ) {
      const K = r[N], G = u[H] = M ? rt(u[H]) : ze(u[H]);
      if (Ft(K, G))
        y(
          K,
          G,
          p,
          null,
          b,
          k,
          T,
          E,
          M
        );
      else
        break;
      N--, H--;
    }
    if (x > N) {
      if (x <= H) {
        const K = H + 1, G = K < B ? u[K].el : C;
        for (; x <= H; )
          y(
            null,
            u[x] = M ? rt(u[x]) : ze(u[x]),
            p,
            G,
            b,
            k,
            T,
            E,
            M
          ), x++;
      }
    } else if (x > H)
      for (; x <= N; )
        Ee(r[x], b, k, !0), x++;
    else {
      const K = x, G = x, se = /* @__PURE__ */ new Map();
      for (x = G; x <= H; x++) {
        const Ie = u[x] = M ? rt(u[x]) : ze(u[x]);
        Ie.key != null && se.set(Ie.key, x);
      }
      let te, de = 0;
      const me = H - G + 1;
      let je = !1, Ve = 0;
      const Rt = new Array(me);
      for (x = 0; x < me; x++) Rt[x] = 0;
      for (x = K; x <= N; x++) {
        const Ie = r[x];
        if (de >= me) {
          Ee(Ie, b, k, !0);
          continue;
        }
        let Ke;
        if (Ie.key != null)
          Ke = se.get(Ie.key);
        else
          for (te = G; te <= H; te++)
            if (Rt[te - G] === 0 && Ft(Ie, u[te])) {
              Ke = te;
              break;
            }
        Ke === void 0 ? Ee(Ie, b, k, !0) : (Rt[Ke - G] = x + 1, Ke >= Ve ? Ve = Ke : je = !0, y(
          Ie,
          u[Ke],
          p,
          null,
          b,
          k,
          T,
          E,
          M
        ), de++);
      }
      const Tn = je ? Yr(Rt) : yt;
      for (te = Tn.length - 1, x = me - 1; x >= 0; x--) {
        const Ie = G + x, Ke = u[Ie], Mn = u[Ie + 1], En = Ie + 1 < B ? (
          // #13559, #14173 fallback to el placeholder for unresolved async component
          Mn.el || on(Mn)
        ) : C;
        Rt[x] === 0 ? y(
          null,
          Ke,
          p,
          En,
          b,
          k,
          T,
          E,
          M
        ) : je && (te < 0 || x !== Tn[te] ? Ue(Ke, p, En, 2) : te--);
      }
    }
  }, Ue = (r, u, p, C, b = null) => {
    const { el: k, type: T, transition: E, children: M, shapeFlag: x } = r;
    if (x & 6) {
      Ue(r.component.subTree, u, p, C);
      return;
    }
    if (x & 128) {
      r.suspense.move(u, p, C);
      return;
    }
    if (x & 64) {
      T.move(r, u, p, O);
      return;
    }
    if (T === j) {
      n(k, u, p);
      for (let N = 0; N < M.length; N++)
        Ue(M[N], u, p, C);
      n(r.anchor, u, p);
      return;
    }
    if (T === Ws) {
      L(r, u, p);
      return;
    }
    if (C !== 2 && x & 1 && E)
      if (C === 0)
        E.persisted && !k[js] ? n(k, u, p) : (E.beforeEnter(k), n(k, u, p), Me(() => E.enter(k), b));
      else {
        const { leave: N, delayLeave: H, afterLeave: K } = E, G = () => {
          r.ctx.isUnmounted ? i(k) : n(k, u, p);
        }, se = () => {
          const te = k._isLeaving || !!k[js];
          k._isLeaving && k[js](
            !0
            /* cancelled */
          ), E.persisted && !te ? G() : N(k, () => {
            G(), K && K();
          });
        };
        H ? H(k, G, se) : se();
      }
    else
      n(k, u, p);
  }, Ee = (r, u, p, C = !1, b = !1) => {
    const {
      type: k,
      props: T,
      ref: E,
      children: M,
      dynamicChildren: x,
      shapeFlag: B,
      patchFlag: N,
      dirs: H,
      cacheIndex: K,
      memo: G
    } = r;
    if ((N === -2 || x && x.hasOnce) && (b = !1), E != null && (Xe(), Vt(E, null, p, r, !0), Ze()), K != null && (!r.ctx || r.ctx === u) && (u.renderCache[K] = void 0), B & 256) {
      u.ctx.deactivate(r);
      return;
    }
    const se = B & 1 && H, te = !Kt(r);
    let de;
    if (te && (de = T && T.onVnodeBeforeUnmount) && We(de, u, r), B & 6)
      Nt(r.component, p, C);
    else {
      if (B & 128) {
        r.suspense.unmount(p, C);
        return;
      }
      se && vt(r, null, u, "beforeUnmount"), B & 64 ? r.type.remove(
        r,
        u,
        p,
        O,
        C
      ) : x && // #5154
      // when v-once is used inside a block, setBlockTracking(-1) marks the
      // parent block with hasOnce: true
      // so that it doesn't take the fast path during unmount - otherwise
      // components nested in v-once are never unmounted.
      !x.hasOnce && // #1153: fast path should not be taken for non-stable (v-for) fragments
      (k !== j || N > 0 && N & 64) ? Te(
        x,
        u,
        p,
        !1,
        !0
      ) : (k === j && N & 384 || !b && B & 16) && Te(M, u, p), C && mt(r);
    }
    const me = G != null && K == null;
    (te && (de = T && T.onVnodeUnmounted) || se || me) && Me(() => {
      de && We(de, u, r), se && vt(r, null, u, "unmounted"), me && (r.el = null);
    }, p);
  }, mt = (r) => {
    const { type: u, el: p, anchor: C, transition: b } = r, k = u === j;
    if (k && !b) {
      At(p, C);
      return;
    }
    if (u === Ws) {
      I(r), b && !b.persisted && b.afterLeave && b.afterLeave();
      return;
    }
    const T = k ? tn(r) : r, E = () => {
      k ? _(p) && At(p, C) : i(p), b && !b.persisted && b.afterLeave && b.afterLeave();
    };
    if (T && T.shapeFlag & 1 && b && !b.persisted) {
      const { leave: M, delayLeave: x } = b, B = T.el, N = () => M(B, E);
      x ? x(B, E, N) : N();
    } else
      E();
  }, At = (r, u) => {
    let p;
    for (; r !== u; )
      p = A(r), i(r), r = p;
    i(u);
  }, Nt = (r, u, p) => {
    const { bum: C, scope: b, job: k, subTree: T, um: E, m: M, a: x } = r;
    qn(M), qn(x), C && as(C), b.stop(), k ? (k.flags |= 8, Ee(T, r, u, p)) : r.vnode.el && T && (T.transition = r.vnode.transition, Ee(T, r, u, p)), E && Me(E, u), Me(() => {
      r.isUnmounted = !0;
    }, u);
  }, Te = (r, u, p, C = !1, b = !1, k = 0) => {
    for (let T = k; T < r.length; T++)
      Ee(r[T], u, p, C, b);
  }, pe = (r) => {
    if (r.shapeFlag & 6)
      return pe(r.component.subTree);
    if (r.shapeFlag & 128)
      return r.suspense.next();
    const u = A(r.anchor || r.el), p = u && u[dr];
    return p ? A(p) : u;
  }, Ot = (r, u, p) => {
    const C = r && u._vnode ? void 0 : r && r.component ? r.component.uid : so();
    rr(() => {
      r == null ? u._vnode && Ee(u._vnode, null, null, !0) : y(
        u._vnode || null,
        r,
        u,
        null,
        null,
        null,
        p
      ), u._vnode = r;
    }, C);
  }, O = {
    p: y,
    um: Ee,
    m: Ue,
    r: mt,
    mt: ge,
    mc: S,
    pc: Y,
    pbc: oe,
    n: pe,
    o: e
  };
  return {
    render: Ot,
    hydrate: void 0,
    createApp: Or(Ot)
  };
}
function Ks({ type: e, props: t }, s) {
  return s === "svg" && e === "foreignObject" || s === "mathml" && e === "annotation-xml" && t && t.encoding && t.encoding.includes("html") ? void 0 : s;
}
function _t({ effect: e, job: t }, s) {
  s ? (e.flags |= 32, t.flags |= 4) : (e.flags &= -33, t.flags &= -5);
}
function Jr(e, t) {
  return (!e || e && !e.pendingBranch) && t && !t.persisted;
}
function rl(e, t, s = !1) {
  const n = e.children, i = t.children;
  if (V(n) && V(i))
    for (let l = 0; l < n.length; l++) {
      const o = n[l];
      let a = i[l];
      a.shapeFlag & 1 && !a.dynamicChildren && ((a.patchFlag <= 0 || a.patchFlag === 32) && (a = i[l] = rt(i[l]), a.el = o.el), !s && a.patchFlag !== -2 && rl(o, a)), a.type === Ns && (a.patchFlag === -1 && (a = i[l] = rt(a)), a.el = o.el), a.type === He && !a.el && (a.el = o.el);
    }
}
function Yr(e) {
  const t = e.slice(), s = [0];
  let n, i, l, o, a;
  const f = e.length;
  for (n = 0; n < f; n++) {
    const h = e[n];
    if (h !== 0) {
      if (i = s[s.length - 1], e[i] < h) {
        t[n] = i, s.push(n);
        continue;
      }
      for (l = 0, o = s.length - 1; l < o; )
        a = l + o >> 1, e[s[a]] < h ? l = a + 1 : o = a;
      h < e[s[l]] && (l > 0 && (t[n] = s[l - 1]), s[l] = n);
    }
  }
  for (l = s.length, o = s[l - 1]; l-- > 0; )
    s[l] = o, o = t[o];
  return s;
}
function ol(e) {
  const t = e.subTree.component;
  if (t)
    return t.asyncDep && !t.asyncResolved ? t : ol(t);
}
function qn(e) {
  if (e)
    for (let t = 0; t < e.length; t++)
      e[t].flags |= 8;
}
function on(e) {
  if (e.placeholder)
    return e.placeholder;
  const t = e.component;
  return t ? on(t.subTree) : null;
}
const al = (e) => e.__isSuspense;
function Qr(e, t) {
  t && t.pendingBranch ? V(e) ? t.effects.push(...e) : t.effects.push(e) : lr(e);
}
const j = /* @__PURE__ */ Symbol.for("v-fgt"), Ns = /* @__PURE__ */ Symbol.for("v-txt"), He = /* @__PURE__ */ Symbol.for("v-cmt"), Ws = /* @__PURE__ */ Symbol.for("v-stc"), wt = [];
let Ae = null;
function g(e = !1) {
  wt.push(Ae = e ? null : []);
}
function ul() {
  wt.pop(), Ae = wt[wt.length - 1] || null;
}
let Jt = 1;
function _s(e, t = !1) {
  Jt += e, e < 0 && Ae && t && (Ae.hasOnce = !0);
}
function cl(e) {
  return e.dynamicChildren = Jt > 0 ? Ae || yt : null, ul(), Jt > 0 && Ae && Ae.push(e), e;
}
function m(e, t, s, n, i, l) {
  return cl(
    c(
      e,
      t,
      s,
      n,
      i,
      l,
      !0
    )
  );
}
function dt(e, t, s, n, i) {
  return cl(
    Ne(
      e,
      t,
      s,
      n,
      i,
      !0
    )
  );
}
function Yt(e) {
  return e ? e.__v_isVNode === !0 : !1;
}
function Ft(e, t) {
  return e.type === t.type && e.key === t.key;
}
const fl = ({ key: e }) => e ?? null, cs = ({
  ref: e,
  ref_key: t,
  ref_for: s
}) => (typeof e == "number" && (e = "" + e), e != null ? ce(e) || /* @__PURE__ */ ke(e) || W(e) ? { i: Oe, r: e, k: t, f: !!s } : e : null);
function c(e, t = null, s = null, n = 0, i = null, l = e === j ? 0 : 1, o = !1, a = !1) {
  const f = {
    __v_isVNode: !0,
    __v_skip: !0,
    type: e,
    props: t,
    key: t && fl(t),
    ref: t && cs(t),
    scopeId: Bi,
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
    shapeFlag: l,
    patchFlag: n,
    dynamicProps: i,
    dynamicChildren: null,
    appContext: null,
    ctx: Oe
  };
  return a ? (bs(f, s), l & 128 && e.normalize(f)) : s && (f.shapeFlag |= ce(s) ? 8 : 16), Jt > 0 && // avoid a block node from tracking itself
  !o && // has current parent block
  Ae && // presence of a patch flag indicates this node needs patching on updates.
  // component nodes also should always be patched, because even if the
  // component doesn't need to update, it needs to persist the instance on to
  // the next vnode so that it can be properly unmounted later.
  (f.patchFlag > 0 || l & 6) && // the EVENTS flag is only for hydration and if it is the only flag, the
  // vnode should not be considered dynamic due to handler caching.
  f.patchFlag !== 32 && Ae.push(f), f;
}
const Ne = Xr;
function Xr(e, t = null, s = null, n = 0, i = null, l = !1) {
  if ((!e || e === Sr) && (e = He), Yt(e)) {
    const a = It(
      e,
      t,
      !0
      /* mergeRef: true */
    );
    return s && bs(a, s), Jt > 0 && !l && Ae && (a.shapeFlag & 6 ? Ae[Ae.indexOf(e)] = a : Ae.push(a)), a.patchFlag = -2, a;
  }
  if (uo(e) && (e = e.__vccOpts), t) {
    t = Zr(t);
    let { class: a, style: f } = t;
    a && !ce(a) && (t.class = Se(a)), Z(f) && (/* @__PURE__ */ yn(f) && !V(f) && (f = ye({}, f)), t.style = be(f));
  }
  const o = ce(e) ? 1 : al(e) ? 128 : Ms(e) ? 64 : Z(e) ? 4 : W(e) ? 2 : 0;
  return c(
    e,
    t,
    s,
    n,
    i,
    o,
    l,
    !0
  );
}
function Zr(e) {
  return e ? /* @__PURE__ */ yn(e) || el(e) ? ye({}, e) : e : null;
}
function It(e, t, s = !1, n = !1) {
  const { props: i, ref: l, patchFlag: o, children: a, transition: f } = e, h = t ? eo(i || {}, t) : i, d = {
    __v_isVNode: !0,
    __v_skip: !0,
    type: e.type,
    props: h,
    key: h && fl(h),
    ref: t && t.ref ? (
      // #2078 in the case of <component :is="vnode" ref="extra"/>
      // if the vnode itself already has a ref, cloneVNode will need to merge
      // the refs so the single vnode can be set on multiple refs
      s && l ? V(l) ? l.concat(cs(t)) : [l, cs(t)] : cs(t)
    ) : l,
    scopeId: e.scopeId,
    slotScopeIds: e.slotScopeIds,
    children: a,
    target: e.target,
    targetStart: e.targetStart,
    targetAnchor: e.targetAnchor,
    staticCount: e.staticCount,
    shapeFlag: e.shapeFlag,
    // if the vnode is cloned with extra props, we can no longer assume its
    // existing patch flag to be reliable and need to add the FULL_PROPS flag.
    // note: preserve flag for fragments since they use the flag for children
    // fast paths only.
    patchFlag: t && e.type !== j ? o === -1 ? 16 : o | 16 : o,
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
    ssContent: e.ssContent && It(e.ssContent),
    ssFallback: e.ssFallback && It(e.ssFallback),
    placeholder: e.placeholder,
    el: e.el,
    anchor: e.anchor,
    ctx: e.ctx,
    ce: e.ce,
    cacheIndex: e.cacheIndex
  };
  return f && n && gs(
    d,
    f.clone(d)
  ), d;
}
function fe(e = " ", t = 0) {
  return Ne(Ns, null, e, t);
}
function X(e = "", t = !1) {
  return t ? (g(), dt(He, null, e)) : Ne(He, null, e);
}
function ze(e) {
  return e == null || typeof e == "boolean" ? Ne(He) : V(e) ? Ne(
    j,
    null,
    // #3666, avoid reference pollution when reusing vnode
    e.slice()
  ) : Yt(e) ? rt(e) : Ne(Ns, null, String(e));
}
function rt(e) {
  return e.el === null && e.patchFlag !== -1 || e.memo ? e : It(e);
}
function bs(e, t) {
  let s = 0;
  const { shapeFlag: n } = e;
  if (t == null)
    t = null;
  else if (V(t))
    s = 16;
  else if (typeof t == "object")
    if (n & 65) {
      const i = t.default;
      i && (i._c && (i._d = !1), bs(e, i()), i._c && (i._d = !0));
      return;
    } else {
      s = 32;
      const i = t._;
      !i && !el(t) ? t._ctx = Oe : i === 3 && Oe && (Oe.slots._ === 1 ? t._ = 1 : (t._ = 2, e.patchFlag |= 1024));
    }
  else if (W(t)) {
    if (n & 65) {
      bs(e, { default: t });
      return;
    }
    t = { default: t, _ctx: Oe }, s = 32;
  } else
    t = String(t), n & 64 ? (s = 16, t = [fe(t)]) : s = 8;
  e.children = t, e.shapeFlag |= s;
}
function eo(...e) {
  const t = {};
  for (let s = 0; s < e.length; s++) {
    const n = e[s];
    for (const i in n)
      if (i === "class")
        t.class !== n.class && (t.class = Se([t.class, n.class]));
      else if (i === "style")
        t.style = be([t.style, n.style]);
      else if (xs(i)) {
        const l = t[i], o = n[i];
        o && l !== o && !(V(l) && l.includes(o)) ? t[i] = l ? [].concat(l, o) : o : o == null && l == null && // mergeProps({ 'onUpdate:modelValue': undefined }) should not retain
        // the model listener.
        !ks(i) && (t[i] = o);
      } else i !== "" && (t[i] = n[i]);
  }
  return t;
}
function We(e, t, s, n = null) {
  Be(e, t, 7, [
    s,
    n
  ]);
}
const to = zi();
let dl = 0;
function so() {
  return dl;
}
function no(e, t, s) {
  const n = e.type, i = (t ? t.appContext : e.appContext) || to, l = {
    uid: dl++,
    vnode: e,
    type: n,
    parent: t,
    appContext: i,
    root: null,
    // to be immediately set
    next: null,
    subTree: null,
    // will be set synchronously right after creation
    effect: null,
    update: null,
    // will be set synchronously right after creation
    job: null,
    scope: new Ml(
      !0
      /* detached */
    ),
    render: null,
    proxy: null,
    exposed: null,
    exposeProxy: null,
    withProxy: null,
    provides: t ? t.provides : Object.create(i.provides),
    ids: t ? t.ids : ["", 0, 0],
    accessCache: null,
    renderCache: [],
    // local resolved assets
    components: null,
    directives: null,
    // resolved props and emits options
    propsOptions: sl(n, i),
    emitsOptions: Ji(n, i),
    // emit
    emit: null,
    // to be set immediately
    emitted: null,
    // props default value
    propsDefaults: ie,
    // inheritAttrs
    inheritAttrs: n.inheritAttrs,
    // state
    ctx: ie,
    data: ie,
    props: ie,
    attrs: ie,
    slots: ie,
    refs: ie,
    setupState: ie,
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
  return l.ctx = { _: l }, l.root = t ? t.root : l, l.emit = Pr.bind(null, l), e.ce && e.ce(l), l;
}
let Ce = null;
const io = () => Ce || Oe;
let ys, Qt;
{
  const e = $s(), t = (s, n) => {
    let i;
    return (i = e[s]) || (i = e[s] = []), i.push(n), (l) => {
      i.length > 1 ? i.forEach((o) => o(l)) : i[0](l);
    };
  };
  ys = t(
    "__VUE_INSTANCE_SETTERS__",
    (s) => Ce = s
  ), Qt = t(
    "__VUE_SSR_SETTERS__",
    (s) => Xt = s
  );
}
const ts = (e) => {
  const t = Ce;
  return ys(e), e.scope.on(), () => {
    e.scope.off(), ys(t);
  };
}, Gn = () => {
  Ce && Ce.scope.off(), ys(null);
};
function hl(e) {
  return e.vnode.shapeFlag & 4;
}
let Xt = !1;
function lo(e, t = !1, s = !1) {
  t && Qt(t);
  const { props: n, children: i } = e.vnode, l = hl(e);
  Ur(e, n, l, t), Wr(e, i, s || t);
  const o = l ? ro(e, t) : void 0;
  return t && Qt(!1), o;
}
function ro(e, t) {
  const s = e.type;
  e.accessCache = /* @__PURE__ */ Object.create(null), e.proxy = new Proxy(e.ctx, Cr);
  const { setup: n } = s;
  if (n) {
    Xe();
    const i = e.setupContext = n.length > 1 ? ao(e) : null, l = ts(e), o = es(
      n,
      e,
      0,
      [
        e.props,
        i
      ]
    ), a = ci(o);
    if (Ze(), l(), (a || e.sp) && !Kt(e) && Vi(e), a) {
      if (o.then(Gn, Gn), t)
        return o.then((f) => {
          Qt(!0);
          try {
            zn(e, f, t);
          } finally {
            Qt(!1);
          }
        }).catch((f) => {
          Ts(f, e, 0);
        });
      e.asyncDep = o;
    } else
      zn(e, o);
  } else
    pl(e);
}
function zn(e, t, s) {
  W(t) ? e.type.__ssrInlineRender ? e.ssrRender = t : e.render = t : Z(t) && (e.setupState = Oi(t)), pl(e);
}
function pl(e, t, s) {
  const n = e.type;
  e.render || (e.render = n.render || Ye);
  {
    const i = ts(e);
    Xe();
    try {
      Tr(e);
    } finally {
      Ze(), i();
    }
  }
}
const oo = {
  get(e, t) {
    return xe(e, "get", ""), e[t];
  }
};
function ao(e) {
  const t = (s) => {
    e.exposed = s || {};
  };
  return {
    attrs: new Proxy(e.attrs, oo),
    slots: e.slots,
    emit: e.emit,
    expose: t
  };
}
function Os(e) {
  return e.exposed ? e.exposeProxy || (e.exposeProxy = new Proxy(Oi(Gl(e.exposed)), {
    get(t, s) {
      if (s in t)
        return t[s];
      if (s in Wt)
        return Wt[s](e);
    },
    has(t, s) {
      return s in t || s in Wt;
    }
  })) : e.proxy;
}
function uo(e) {
  return W(e) && "__vccOpts" in e;
}
const ue = (e, t) => /* @__PURE__ */ Zl(e, t, Xt);
function co(e, t, s) {
  try {
    _s(-1);
    const n = arguments.length;
    return n === 2 ? Z(t) && !V(t) ? Yt(t) ? Ne(e, null, [t]) : Ne(e, t) : Ne(e, null, t) : (n > 3 ? s = Array.prototype.slice.call(arguments, 2) : n === 3 && Yt(s) && (s = [s]), Ne(e, t, s));
  } finally {
    _s(1);
  }
}
const fo = "3.5.44";
let an;
const Jn = typeof window < "u" && window.trustedTypes;
if (Jn)
  try {
    an = /* @__PURE__ */ Jn.createPolicy("vue", {
      createHTML: (e) => e
    });
  } catch {
  }
const gl = an ? (e) => an.createHTML(e) : (e) => e, ho = "http://www.w3.org/2000/svg", po = "http://www.w3.org/1998/Math/MathML", lt = typeof document < "u" ? document : null, Yn = lt && /* @__PURE__ */ lt.createElement("template"), go = {
  insert: (e, t, s) => {
    t.insertBefore(e, s || null);
  },
  remove: (e) => {
    const t = e.parentNode;
    t && t.removeChild(e);
  },
  createElement: (e, t, s, n) => {
    const i = t === "svg" ? lt.createElementNS(ho, e) : t === "mathml" ? lt.createElementNS(po, e) : s ? lt.createElement(e, { is: s }) : lt.createElement(e);
    return e === "select" && n && n.multiple != null && i.setAttribute("multiple", n.multiple), i;
  },
  createText: (e) => lt.createTextNode(e),
  createComment: (e) => lt.createComment(e),
  setText: (e, t) => {
    e.nodeValue = t;
  },
  setElementText: (e, t) => {
    e.textContent = t;
  },
  parentNode: (e) => e.parentNode,
  nextSibling: (e) => e.nextSibling,
  querySelector: (e) => lt.querySelector(e),
  setScopeId(e, t) {
    e.setAttribute(t, "");
  },
  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  insertStaticContent(e, t, s, n, i, l) {
    const o = s ? s.previousSibling : t.lastChild;
    if (i && (i === l || i.nextSibling))
      for (; t.insertBefore(i.cloneNode(!0), s), !(i === l || !(i = i.nextSibling)); )
        ;
    else {
      Yn.innerHTML = gl(
        n === "svg" ? `<svg>${e}</svg>` : n === "mathml" ? `<math>${e}</math>` : e
      );
      const a = Yn.content;
      if (n === "svg" || n === "mathml") {
        const f = a.firstChild;
        for (; f.firstChild; )
          a.appendChild(f.firstChild);
        a.removeChild(f);
      }
      t.insertBefore(a, s);
    }
    return [
      // first
      o ? o.nextSibling : t.firstChild,
      // last
      s ? s.previousSibling : t.lastChild
    ];
  }
}, mo = /* @__PURE__ */ Symbol("_vtc");
function vo(e, t, s) {
  const n = e[mo];
  n && (t = (t ? [t, ...n] : [...n]).join(" ")), t == null ? e.removeAttribute("class") : s ? e.setAttribute("class", t) : e.className = t;
}
const Qn = /* @__PURE__ */ Symbol("_vod"), _o = /* @__PURE__ */ Symbol("_vsh"), bo = /* @__PURE__ */ Symbol(""), yo = /(?:^|;)\s*display\s*:/;
function xo(e, t, s) {
  const n = e.style, i = ce(s);
  let l = !1;
  if (s && !i) {
    if (t)
      if (ce(t))
        for (const o of t.split(";")) {
          const a = o.slice(0, o.indexOf(":")).trim();
          s[a] == null && Bt(n, a, "");
        }
      else
        for (const o in t)
          s[o] == null && Bt(n, o, "");
    for (const o in s) {
      o === "display" && (l = !0);
      const a = s[o];
      a != null ? wo(
        e,
        o,
        !ce(t) && t ? t[o] : void 0,
        a
      ) || Bt(n, o, a) : Bt(n, o, "");
    }
  } else if (i) {
    if (t !== s) {
      const o = n[bo];
      o && (s += ";" + o), n.cssText = s, l = yo.test(s);
    }
  } else t && e.removeAttribute("style");
  Qn in e && ((!i || t !== s) && (e[Qn] = l ? n.display : ""), e[_o] && (n.display = "none"));
}
const ls = /\s*!important$/;
function Bt(e, t, s) {
  if (V(s))
    s.forEach((n) => Bt(e, t, n));
  else if (s == null && (s = ""), t.startsWith("--"))
    ls.test(s) ? e.setProperty(t, s.replace(ls, ""), "important") : e.setProperty(t, s);
  else {
    const n = ko(e, t);
    ls.test(s) ? e.setProperty(
      $t(n),
      s.replace(ls, ""),
      "important"
    ) : e[n] = s;
  }
}
const Xn = ["Webkit", "Moz", "ms"], qs = {};
function ko(e, t) {
  const s = qs[t];
  if (s)
    return s;
  let n = De(t);
  if (n !== "filter" && n in e)
    return qs[t] = n;
  n = hi(n);
  for (let i = 0; i < Xn.length; i++) {
    const l = Xn[i] + n;
    if (l in e)
      return qs[t] = l;
  }
  return t;
}
function wo(e, t, s, n) {
  return e.tagName === "TEXTAREA" && (t === "width" || t === "height") && ce(n) && s === n;
}
const Zn = "http://www.w3.org/1999/xlink";
function ei(e, t, s, n, i, l = Sl(t)) {
  n && t.startsWith("xlink:") ? s == null ? e.removeAttributeNS(Zn, t.slice(6, t.length)) : e.setAttributeNS(Zn, t, s) : s == null || l && !gi(s) ? e.removeAttribute(t) : e.setAttribute(
    t,
    l ? "" : Qe(s) ? String(s) : s
  );
}
function ti(e, t, s, n, i) {
  if (t === "innerHTML" || t === "textContent") {
    s != null && (e[t] = t === "innerHTML" ? gl(s) : s);
    return;
  }
  const l = e.tagName;
  if (t === "value" && l !== "PROGRESS" && // custom elements may use _value internally
  !l.includes("-")) {
    const a = l === "OPTION" ? e.getAttribute("value") || "" : e.value, f = s == null ? (
      // #11647: value should be set as empty string for null and undefined,
      // but <input type="checkbox"> should be set as 'on'.
      e.type === "checkbox" ? "on" : ""
    ) : String(s);
    (a !== f || !("_value" in e)) && (e.value = f), s == null && e.removeAttribute(t), e._value = s;
    return;
  }
  let o = !1;
  if (s === "" || s == null) {
    const a = typeof e[t];
    a === "boolean" ? s = gi(s) : s == null && a === "string" ? (s = "", o = !0) : a === "number" && (s = 0, o = !0);
  }
  try {
    e[t] = s;
  } catch {
  }
  o && e.removeAttribute(i || t);
}
function Mt(e, t, s, n) {
  e.addEventListener(t, s, n);
}
function $o(e, t, s, n) {
  e.removeEventListener(t, s, n);
}
const si = /* @__PURE__ */ Symbol("_vei");
function So(e, t, s, n, i = null) {
  const l = e[si] || (e[si] = {}), o = l[t];
  if (n && o)
    o.value = n;
  else {
    const [a, f] = Mo(t);
    if (n) {
      const h = l[t] = Ao(
        n,
        i
      );
      Mt(e, a, h, f);
    } else o && ($o(e, a, o, f), l[t] = void 0);
  }
}
const Co = /(Once|Passive|Capture)$/, To = /^on:?(?:Once|Passive|Capture)$/;
function Mo(e) {
  let t, s;
  for (; (s = e.match(Co)) && !To.test(e); )
    t || (t = {}), e = e.slice(0, e.length - s[1].length), t[s[1].toLowerCase()] = !0;
  return [e[2] === ":" ? e.slice(3) : $t(e.slice(2)), t];
}
let Gs = 0;
const Eo = /* @__PURE__ */ Promise.resolve(), Io = () => Gs || (Eo.then(() => Gs = 0), Gs = Date.now());
function Ao(e, t) {
  const s = (n) => {
    if (!n._vts)
      n._vts = Date.now();
    else if (n._vts <= s.attached)
      return;
    const i = s.value;
    if (V(i)) {
      const l = n.stopImmediatePropagation;
      n.stopImmediatePropagation = () => {
        l.call(n), n._stopped = !0;
      };
      const o = i.slice(), a = [n];
      for (let f = 0; f < o.length && !n._stopped; f++) {
        const h = o[f];
        h && Be(
          h,
          t,
          5,
          a
        );
      }
    } else
      Be(
        i,
        t,
        5,
        [n]
      );
  };
  return s.value = e, s.attached = Io(), s;
}
const ni = (e) => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && // lowercase letter
e.charCodeAt(2) > 96 && e.charCodeAt(2) < 123, No = (e, t, s, n, i, l) => {
  const o = i === "svg";
  t === "class" ? vo(e, n, o) : t === "style" ? xo(e, s, n) : xs(t) ? ks(t) || So(e, t, s, n, l) : (t[0] === "." ? (t = t.slice(1), !0) : t[0] === "^" ? (t = t.slice(1), !1) : Oo(e, t, n, o)) ? (ti(e, t, n), !e.tagName.includes("-") && (t === "value" || t === "checked" || t === "selected") && ei(e, t, n, o, l, t !== "value")) : /* #11081 force set props for possible async custom element */ e._isVueCE && // #12408 check if it's declared prop or it's async custom element
  (Ro(e, t) || // @ts-expect-error _def is private
  e._def.__asyncLoader && (/[A-Z]/.test(t) || !ce(n))) ? ti(e, De(t), n, l, t) : (t === "true-value" ? e._trueValue = n : t === "false-value" && (e._falseValue = n), ei(e, t, n, o));
};
function Oo(e, t, s, n) {
  if (n)
    return !!(t === "innerHTML" || t === "textContent" || t in e && ni(t) && W(s));
  if (t === "spellcheck" || t === "draggable" || t === "translate" || t === "autocorrect" || t === "sandbox" && e.tagName === "IFRAME" || t === "form" || t === "list" && e.tagName === "INPUT" || t === "type" && e.tagName === "TEXTAREA")
    return !1;
  if (t === "width" || t === "height") {
    const i = e.tagName;
    if (i === "IMG" || i === "VIDEO" || i === "CANVAS" || i === "SOURCE")
      return !1;
  }
  return ni(t) && ce(s) ? !1 : t in e;
}
function Ro(e, t) {
  const s = (
    // @ts-expect-error _def is private
    e._def.props
  );
  if (!s)
    return !1;
  const n = De(t);
  return Array.isArray(s) ? s.some((i) => De(i) === n) : Object.keys(s).some((i) => De(i) === n);
}
const ii = (e) => {
  const t = e.props["onUpdate:modelValue"] || !1;
  return V(t) ? (s) => as(t, s) : t;
};
function Po(e) {
  e.target.composing = !0;
}
function li(e) {
  const t = e.target;
  t.composing && (t.composing = !1, t.dispatchEvent(new Event("input")));
}
const rs = /* @__PURE__ */ Symbol("_assign"), os = /* @__PURE__ */ Symbol("_initialValue");
function zs(e, t, s) {
  return t && (e = e.trim()), s && (e = dn(e)), e;
}
const Js = {
  created(e, { modifiers: { lazy: t, trim: s, number: n } }, i) {
    e.parentNode && (e.type === "text" ? e[os] = e.defaultValue.replace(/[\r\n]/g, "") : e.type === "textarea" && (e[os] = e.defaultValue.replace(/\r\n?/g, `
`))), e[rs] = ii(i);
    const l = n || i.props && i.props.type === "number";
    Mt(e, t ? "change" : "input", (o) => {
      o.target.composing || e[rs](zs(e.value, s, l));
    }), (s || l) && Mt(e, "change", () => {
      e.value = zs(e.value, s, l);
    }), t || (Mt(e, "compositionstart", Po), Mt(e, "compositionend", li), Mt(e, "change", li));
  },
  // set value on mounted so it's after min/max for type="range"
  mounted(e, { value: t, modifiers: { trim: s, number: n } }) {
    const i = t ?? "", l = e[os];
    delete e[os], l !== void 0 && (e.type === "text" || e.type === "textarea") && e.value !== l ? e[rs](zs(e.value, s, n)) : e.value = i;
  },
  beforeUpdate(e, { value: t, oldValue: s, modifiers: { lazy: n, trim: i, number: l } }, o) {
    if (e[rs] = ii(o), e.composing) return;
    const a = (l || e.type === "number") && !/^0\d/.test(e.value) ? dn(e.value) : e.value, f = t ?? "";
    if (a === f)
      return;
    const h = e.getRootNode();
    (h instanceof Document || h instanceof ShadowRoot) && h.activeElement === e && e.type !== "range" && (n && t === s || i && e.value.trim() === f) || (e.value = f);
  }
}, Fo = ["ctrl", "shift", "alt", "meta"], Do = {
  stop: (e) => e.stopPropagation(),
  prevent: (e) => e.preventDefault(),
  self: (e) => e.target !== e.currentTarget,
  ctrl: (e) => !e.ctrlKey,
  shift: (e) => !e.shiftKey,
  alt: (e) => !e.altKey,
  meta: (e) => !e.metaKey,
  left: (e) => "button" in e && e.button !== 0,
  middle: (e) => "button" in e && e.button !== 1,
  right: (e) => "button" in e && e.button !== 2,
  exact: (e, t) => Fo.some((s) => e[`${s}Key`] && !t.includes(s))
}, Cn = (e, t) => {
  if (!e) return e;
  const s = e._withMods || (e._withMods = {}), n = t.join(".");
  return s[n] || (s[n] = ((i, ...l) => {
    for (let o = 0; o < t.length; o++) {
      const a = Do[t[o]];
      if (a && a(i, t)) return;
    }
    return e(i, ...l);
  }));
}, Lo = /* @__PURE__ */ ye({ patchProp: No }, go);
let ri;
function Bo() {
  return ri || (ri = Gr(Lo));
}
const Ho = ((...e) => {
  const t = Bo().createApp(...e), { mount: s } = t;
  return t.mount = (n) => {
    const i = jo(n);
    if (!i) return;
    const l = t._component;
    !W(l) && !l.render && !l.template && (l.template = i.innerHTML), i.nodeType === 1 && (i.textContent = "");
    const o = s(i, !1, Uo(i));
    return i instanceof Element && (i.removeAttribute("v-cloak"), i.setAttribute("data-v-app", "")), o;
  }, t;
});
function Uo(e) {
  if (e instanceof SVGElement)
    return "svg";
  if (typeof MathMLElement == "function" && e instanceof MathMLElement)
    return "mathml";
}
function jo(e) {
  return ce(e) ? document.querySelector(e) : e;
}
const Vo = {
  class: "craft-book",
  role: "dialog",
  "aria-modal": "true",
  "aria-labelledby": "craft-title"
}, Ko = ["disabled"], Wo = ["src"], qo = {
  key: 0,
  class: "craft-error",
  role: "alert"
}, Go = { class: "recipe-list" }, zo = ["src", "alt"], Jo = { class: "recipe-summary" }, Yo = { class: "drink-picture" }, Qo = ["src", "alt"], Xo = ["src"], Zo = { class: "recipe-price" }, ea = ["src"], ta = { class: "recipe-estimate" }, sa = { key: 0 }, na = {
  key: 0,
  class: "recipe-empty"
}, ia = {
  key: 1,
  class: "recipe-empty"
}, la = {
  key: 2,
  class: "fruit-list"
}, ra = ["aria-pressed", "aria-label", "disabled", "onClick"], oa = ["src", "alt"], aa = { key: 1 }, ua = {
  key: 0,
  class: "recipe-empty"
}, ca = { class: "craft-footer" }, fa = ["disabled"], da = { class: "select-all" }, ha = ["checked", "disabled"], pa = /* @__PURE__ */ Es({
  __name: "MilkTeaCraftDialog",
  props: {
    state: {},
    busy: { type: Boolean },
    loading: { type: Boolean },
    error: {}
  },
  emits: ["close", "craft"],
  setup(e, { emit: t }) {
    const s = e, n = t, i = (P) => `/activity/milk-tea/${P}.png`, l = /* @__PURE__ */ ve([]), o = ue(() => (s.state.recipes || []).filter((P) => P.is_advanced).sort((P, y) => Number(y.unlocked) - Number(P.unlocked) || Number(P.recipe_id) - Number(y.recipe_id))), a = (P) => P.unlocked ? (P.fruits || []).filter((y) => /^\d+$/.test(String(y.uid)) && BigInt(y.uid) > 0n && BigInt(y.count || 0) > 0n) : [], f = ue(() => [...new Set(o.value.flatMap((P) => a(P).map((y) => String(y.uid))))]), h = ue(() => f.value.length > 0 && f.value.every((P) => l.value.includes(P))), d = ue(() => s.busy || s.loading || s.state.phase !== "business");
    kt(f, (P) => {
      l.value = l.value.filter((y) => P.includes(y));
    }, { immediate: !0 });
    function _(P) {
      d.value || (l.value = l.value.includes(P) ? l.value.filter((y) => y !== P) : [...l.value, P]);
    }
    function A(P) {
      return a(P).some((y) => l.value.includes(String(y.uid)));
    }
    function w(P) {
      return s.state.levels?.find((y) => y.recipe_names?.includes(P.recipe_name))?.level;
    }
    return (P, y) => (g(), m("div", {
      class: "craft-shade",
      onClick: y[3] || (y[3] = Cn((F) => !e.busy && n("close"), ["self"]))
    }, [
      c("section", Vo, [
        c("button", {
          class: "craft-close",
          "aria-label": "关闭奶茶工坊",
          disabled: e.busy,
          onClick: y[0] || (y[0] = (F) => n("close"))
        }, [
          c("img", {
            src: i("img_s4_closeBtn"),
            alt: ""
          }, null, 8, Wo)
        ], 8, Ko),
        y[8] || (y[8] = c("h2", { id: "craft-title" }, " 奶茶工坊 ", -1)),
        e.error ? (g(), m("p", qo, $(e.error), 1)) : X("", !0),
        c("div", Go, [
          (g(!0), m(j, null, ne(o.value, (F) => (g(), m("article", {
            key: F.recipe_id,
            class: Se(["recipe-card", { locked: !F.unlocked }])
          }, [
            c("img", {
              class: "recipe-name",
              src: i(`img_s4TeaMaker_name${F.recipe_id}`),
              alt: F.recipe_name
            }, null, 8, zo),
            c("div", Jo, [
              c("div", Yo, [
                c("img", {
                  src: F.config?.image || i(`icon_s4_milktea_${F.recipe_id}`),
                  alt: F.recipe_name
                }, null, 8, Qo),
                F.unlocked ? X("", !0) : (g(), m("img", {
                  key: 0,
                  class: "lock",
                  src: i("img_s4_v2_lock"),
                  alt: "未解锁"
                }, null, 8, Xo))
              ]),
              c("div", Zo, [
                y[5] || (y[5] = c("span", null, "售出单价", -1)),
                c("b", null, [
                  c("img", {
                    src: i("img_s4TeaUI_rewardpng"),
                    alt: "奶茶券"
                  }, null, 8, ea),
                  fe($(F.token_price), 1)
                ]),
                c("b", null, [
                  y[4] || (y[4] = c("span", {
                    class: "coin",
                    "aria-label": "金币"
                  }, "金币", -1)),
                  fe($(F.coin_price), 1)
                ])
              ]),
              c("div", ta, [
                y[6] || (y[6] = c("span", null, "预计制作", -1)),
                c("strong", null, [
                  fe($(A(F) ? "待结算" : "0"), 1),
                  A(F) ? X("", !0) : (g(), m("small", sa, "杯"))
                ])
              ])
            ]),
            F.unlocked ? a(F).length ? (g(), m("div", la, [
              (g(!0), m(j, null, ne(a(F), (U) => (g(), m("button", {
                key: U.uid,
                class: Se(["fruit-choice", { selected: l.value.includes(String(U.uid)) }]),
                "aria-pressed": l.value.includes(String(U.uid)),
                "aria-label": `${U.name}，${U.count}个`,
                disabled: d.value,
                onClick: (q) => _(String(U.uid))
              }, [
                U.image ? (g(), m("img", {
                  key: 0,
                  src: U.image,
                  alt: U.name
                }, null, 8, oa)) : (g(), m("span", aa, $(U.name), 1)),
                c("b", null, "×" + $(U.count), 1)
              ], 10, ra))), 128))
            ])) : (g(), m("div", ia, " 暂无材料，收获果实后再来制作吧 ")) : (g(), m("div", na, $(w(F) ? `店铺达到${w(F)}级即可解锁` : "暂未解锁"), 1))
          ], 2))), 128)),
          o.value.length ? X("", !0) : (g(), m("p", ua, " 暂无配方数据 "))
        ]),
        c("footer", ca, [
          c("span", null, "已选：" + $(l.value.length), 1),
          c("button", {
            class: "craft-confirm",
            disabled: d.value || !l.value.length,
            onClick: y[1] || (y[1] = (F) => n("craft", { fruitUids: [...l.value] }))
          }, $(e.busy ? "制作中…" : "确认制作"), 9, fa),
          c("label", da, [
            c("input", {
              type: "checkbox",
              checked: h.value,
              disabled: d.value || !f.value.length,
              onChange: y[2] || (y[2] = (F) => l.value = h.value ? [] : [...f.value])
            }, null, 40, ha),
            y[7] || (y[7] = c("span", null, "全选", -1))
          ])
        ])
      ])
    ]));
  }
}), Rs = (e, t) => {
  const s = e.__vccOpts || e;
  for (const [n, i] of t)
    s[n] = i;
  return s;
}, ga = /* @__PURE__ */ Rs(pa, [["__scopeId", "data-v-080721cf"]]), ma = ["title"], va = {
  key: 0,
  class: "reward-name"
}, _a = ["src", "alt"], ba = {
  key: 1,
  class: "reward-fallback"
}, ya = /* @__PURE__ */ Es({
  __name: "MilkTeaRewardIcon",
  props: {
    item: {},
    named: { type: Boolean }
  },
  setup(e) {
    return (t, s) => (g(), m("div", {
      class: "tea-reward",
      title: `${e.item.name || ""} ×${e.item.count}`
    }, [
      e.named ? (g(), m("span", va, $(e.item.name), 1)) : X("", !0),
      c("div", {
        class: Se(["reward-frame", `rarity-${e.item.rarity || 0}`])
      }, [
        e.item.image ? (g(), m("img", {
          key: 0,
          src: e.item.image,
          alt: e.item.name || ""
        }, null, 8, _a)) : (g(), m("span", ba, $(e.item.name || "奖励"), 1)),
        c("b", null, $(e.item.count), 1)
      ], 2)
    ], 8, ma));
  }
}), Dt = /* @__PURE__ */ Rs(ya, [["__scopeId", "data-v-1c7fa7ab"]]), xa = ["aria-label"], ka = ["src"], wa = {
  key: 0,
  class: "dialog-title"
}, $a = {
  key: 1,
  class: "dialog-error",
  role: "alert"
}, Sa = ["src"], Ca = { class: "upgrade-house" }, Ta = ["src"], Ma = ["src"], Ea = { class: "revenue-progress" }, Ia = { class: "progress-track" }, Aa = { class: "upgrade-effects" }, Na = { key: 0 }, Oa = { key: 1 }, Ra = { key: 0 }, Pa = { class: "upgrade-rewards" }, Fa = { class: "rewards upgrade-reward-list scroll-area" }, Da = ["disabled"], La = {
  key: 3,
  class: "preview-scroll scroll-area"
}, Ba = { key: 0 }, Ha = { class: "revenue-required" }, Ua = { class: "level-effects" }, ja = { class: "rewards" }, Va = {
  key: 4,
  class: "sales-scroll scroll-area"
}, Ka = {
  key: 0,
  class: "empty"
}, Wa = { class: "sales-date" }, qa = { class: "sales-drinks" }, Ga = ["src", "alt"], za = { class: "sales-income" }, Ja = { class: "rewards" }, Ya = { key: 0 }, Qa = {
  key: 0,
  class: "empty"
}, Xa = ["src"], Za = {
  key: 1,
  class: "avatar-fallback"
}, eu = ["src"], tu = {
  key: 5,
  class: "rank-paper"
}, su = { class: "rank-scroll scroll-area" }, nu = {
  key: 0,
  class: "empty"
}, iu = { class: "rank-avatar" }, lu = ["src"], ru = { key: 1 }, ou = { class: "rank-player" }, au = ["src"], uu = ["src"], cu = { class: "share-time" }, fu = ["src"], du = ["src"], hu = { class: "share-score" }, pu = { class: "share-milestones" }, gu = { class: "milestone-rewards" }, mu = ["src", "alt"], vu = { class: "share-progress" }, _u = { class: "share-pool" }, bu = { class: "share-buttons" }, yu = ["disabled"], xu = ["disabled"], ku = ["src"], wu = { class: "fund-tiers scroll-area" }, $u = { class: "fund-level" }, Su = { class: "fund-reward-row" }, Cu = ["src", "alt"], Tu = ["disabled"], Mu = ["disabled"], Eu = {
  key: 1,
  class: "paint-button fund-submit",
  disabled: "",
  title: "不支持钻石购买"
}, Iu = {
  key: 8,
  class: "empty"
}, Au = {
  key: 9,
  class: "native-notice",
  role: "status"
}, Nu = /* @__PURE__ */ Es({
  __name: "MilkTeaShopDialogs",
  props: {
    kind: {},
    state: {},
    records: {},
    busy: { type: Boolean },
    error: {}
  },
  emits: ["close", "action"],
  setup(e, { emit: t }) {
    const s = e, n = t, i = /* @__PURE__ */ ve(!1), l = /* @__PURE__ */ ve("");
    kt(() => s.kind, () => {
      i.value = !1, l.value = "";
    });
    const o = (D) => `/activity/milk-tea/${D}.png`, a = ue(() => s.state.levels?.find((D) => D.level === Number(s.state.shop?.level))), f = ue(() => s.state.levels?.find((D) => D.level === Number(s.state.shop?.level) + 1)), h = ue(() => Math.min(100, Number(s.state.shop?.total_revenue || 0) / Math.max(1, Number(s.state.shop?.next_level_revenue || 1)) * 100)), d = { upgrade: "店铺升级", sales: "营业记录", rank: "排行榜" }, _ = ue(() => i.value ? "等级预览" : d[s.kind]), A = ue(() => Number(s.state.share?.current_score || 0)), w = ue(() => s.state.share?.milestones || []), P = ue(() => Math.min(100, A.value / Math.max(1, ...w.value.map((D) => Number(D.threshold))) * 100)), y = ue(() => {
      const D = Math.max(0, Number(s.state.endTime) - Number(s.state.serverTime));
      return `${Math.floor(D / 86400)}天${Math.floor(D % 86400 / 3600)}时`;
    });
    function F(D) {
      const R = Number(D);
      return R >= 1e4 ? `${Number((R / 1e4).toFixed(1))}万` : String(D ?? 0);
    }
    function U(D, R = !1) {
      return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", ...R ? { year: "numeric", month: "2-digit", day: "2-digit" } : { hour: "2-digit", minute: "2-digit", hour12: !1 } }).format(new Date(Number(D) * 1e3));
    }
    function q(D, R) {
      if (!D)
        return [];
      const S = [{ name: "热卖值", icon: "img_s4TeaUpLv_itemBg0", text: `${D.base_popularity}杯/小时` }];
      (!R || D.employee_slot_count !== R.employee_slot_count) && S.push({ name: "招员工", icon: "img_s4TeaUpLv_itemBg1", text: `员工雇佣位${D.employee_slot_count}个` });
      const he = (D.recipe_names || []).filter((oe) => !(R?.recipe_names || []).includes(oe));
      return he.length && S.push({ name: "新配方", icon: "img_s4TeaUpLv_itemBg2", text: `解锁${he.join("、")}` }), D.shop_item_string && S.push({ name: "商品解锁", icon: "img_s4TeaUpLv_itemBg3", text: `解锁${D.shop_item_string}` }), R && D.advanced_price_percent !== R.advanced_price_percent && S.push({ name: "售价提升", icon: "img_s4TeaUpLv_itemBg4", text: `特殊奶茶售价+${D.advanced_price_percent / 100}%` }), S;
    }
    const L = ue(() => {
      const D = String(s.records?.day || "");
      return /^\d{8}$/.test(D) ? `${D.slice(0, 4)}-${D.slice(4, 6)}-${D.slice(6)}` : s.records?.day ? U(s.records.day, !0) : "";
    }), I = (D) => /^https?:\/\//.test(D || "") ? D : "";
    function re() {
      l.value = "请在 QQ 游戏内使用此功能";
    }
    return (D, R) => (g(), m("div", {
      class: "dialog-shade",
      onClick: R[7] || (R[7] = Cn((S) => n("close"), ["self"]))
    }, [
      c("section", {
        class: Se(["shop-dialog", [{ notebook: !i.value && ["upgrade", "sales"].includes(e.kind), orange: i.value || e.kind === "rank" }, e.kind]]),
        role: "dialog",
        "aria-modal": "true",
        "aria-label": _.value || (e.kind === "share" ? "快乐不独享" : "成长基金")
      }, [
        c("button", {
          class: Se(["dialog-close", { round: i.value || e.kind === "rank" || e.kind === "share" }]),
          "aria-label": "关闭",
          onClick: R[0] || (R[0] = (S) => i.value ? i.value = !1 : n("close"))
        }, [
          c("img", {
            src: o(e.kind === "share" ? "btn_s4HappyShare_close" : i.value || e.kind === "rank" ? "img_s4Open_close" : "img_s4_closeBtn"),
            alt: ""
          }, null, 8, ka)
        ], 2),
        _.value ? (g(), m("h2", wa, $(_.value), 1)) : X("", !0),
        e.error ? (g(), m("p", $a, $(e.error), 1)) : X("", !0),
        e.kind === "upgrade" && !i.value ? (g(), m(j, { key: 2 }, [
          c("button", {
            class: "level-preview",
            onClick: R[1] || (R[1] = (S) => i.value = !0)
          }, [
            c("img", {
              src: o("img_s4TeaUpLv_btnPre"),
              alt: "等级预览"
            }, null, 8, Sa)
          ]),
          c("div", Ca, [
            c("img", {
              src: o("img_s4TeaUpLv_house"),
              alt: ""
            }, null, 8, Ta),
            c("strong", null, [
              fe($(e.state.shop.level) + "级 ", 1),
              c("img", {
                src: o("img_s4TeaUpLv_arrow"),
                alt: "到"
              }, null, 8, Ma),
              fe(" " + $(f.value ? `${f.value.level}级` : "满级"), 1)
            ])
          ]),
          c("div", Ea, [
            c("div", null, [
              R[8] || (R[8] = c("b", null, "营业额:", -1)),
              c("b", null, $(F(e.state.shop.total_revenue)) + "/" + $(F(e.state.shop.next_level_revenue)), 1)
            ]),
            c("div", Ia, [
              c("i", {
                style: be({ width: `${h.value}%` })
              }, null, 4)
            ])
          ]),
          c("div", Aa, [
            R[9] || (R[9] = c("h3", { class: "section-line" }, " 升级效果 ", -1)),
            (g(!0), m(j, null, ne(q(f.value, a.value), (S) => (g(), m("div", {
              key: S.name,
              class: "effect-row"
            }, [
              c("b", {
                class: "effect-label",
                style: be({ backgroundImage: `url(${o(S.icon)})` })
              }, $(S.name), 5),
              S.name === "热卖值" ? (g(), m("span", Na, [
                fe($(a.value?.base_popularity) + "杯/小时 ", 1),
                c("em", null, "➜ " + $(S.text), 1)
              ])) : (g(), m("span", Oa, $(S.text), 1))
            ]))), 128)),
            f.value ? X("", !0) : (g(), m("p", Ra, " 店铺已满级 "))
          ]),
          c("div", Pa, [
            R[10] || (R[10] = c("h3", { class: "section-line" }, " 升级奖励 ", -1)),
            c("div", Fa, [
              (g(!0), m(j, null, ne(f.value?.rewards || [], (S) => (g(), dt(Dt, {
                key: S.id,
                item: S,
                named: ""
              }, null, 8, ["item"]))), 128))
            ])
          ]),
          c("button", {
            class: "paint-button upgrade-submit",
            disabled: e.busy || !e.state.summary.can_upgrade,
            onClick: R[2] || (R[2] = (S) => n("action", "upgrade"))
          }, " 立即升级 ", 8, Da)
        ], 64)) : i.value ? (g(), m("div", La, [
          (g(!0), m(j, null, ne(e.state.levels, (S, he) => (g(), m("article", {
            key: S.level,
            class: Se(["level-card", { current: S.level === Number(e.state.shop.level) }])
          }, [
            c("h3", null, [
              S.level === Number(e.state.shop.level) + 1 ? (g(), m("small", Ba, "下一级")) : X("", !0),
              fe($(S.level) + "级", 1)
            ]),
            c("b", Ha, "营业额需：" + $(S.revenue_required), 1),
            c("div", Ua, [
              (g(!0), m(j, null, ne(q(S, e.state.levels[Number(he) - 1]), (oe) => (g(), m("div", {
                key: oe.name
              }, [
                c("b", {
                  class: "effect-label",
                  style: be({ backgroundImage: `url(${o(oe.icon)})` })
                }, $(oe.name), 5),
                c("p", null, $(oe.text), 1)
              ]))), 128))
            ]),
            R[11] || (R[11] = c("h4", { class: "section-line" }, " 等级奖励 ", -1)),
            c("div", ja, [
              (g(!0), m(j, null, ne(S.rewards, (oe) => (g(), dt(Dt, {
                key: oe.id,
                item: oe
              }, null, 8, ["item"]))), 128))
            ])
          ], 2))), 128))
        ])) : e.kind === "sales" ? (g(), m("div", Va, [
          e.records ? (g(), m(j, { key: 1 }, [
            c("h3", Wa, $(L.value), 1),
            c("div", qa, [
              (g(!0), m(j, null, ne(e.records.drinks || [], (S) => (g(), m("div", {
                key: S.recipe_id
              }, [
                c("img", {
                  src: S.image,
                  alt: S.name
                }, null, 8, Ga),
                c("span", null, [
                  c("b", null, $(S.name), 1),
                  c("em", null, $(S.cups) + "杯", 1)
                ])
              ]))), 128))
            ]),
            c("section", za, [
              R[12] || (R[12] = c("h3", null, "营业收益", -1)),
              c("div", Ja, [
                (g(!0), m(j, null, ne(e.records.rewards || [], (S) => (g(), dt(Dt, {
                  key: S.id,
                  item: { ...S, count: F(S.count) }
                }, null, 8, ["item"]))), 128))
              ]),
              e.records.rewards?.length ? X("", !0) : (g(), m("p", Ya, " 暂无收益 "))
            ]),
            R[16] || (R[16] = c("h3", { class: "section-line" }, " 雇员记录 ", -1)),
            e.records.hires?.length ? X("", !0) : (g(), m("p", Qa, " 暂无雇员记录 ")),
            (g(!0), m(j, null, ne(e.records.hires || [], (S) => (g(), m("article", {
              key: S.shift_id,
              class: "hire-record"
            }, [
              c("time", null, $(U(S.hire_at)), 1),
              c("header", null, [
                I(S.friend?.avatar) ? (g(), m("img", {
                  key: 0,
                  src: I(S.friend.avatar),
                  alt: ""
                }, null, 8, Xa)) : (g(), m("span", Za, $(S.friend?.name?.slice(0, 1)), 1)),
                c("small", null, $(S.talent_name), 1),
                c("b", null, $(S.friend?.name), 1)
              ]),
              c("dl", null, [
                c("div", null, [
                  R[13] || (R[13] = c("dt", null, "工作时长", -1)),
                  c("dd", null, $(Number(S.duration_sec) / 3600) + "小时", 1)
                ]),
                c("div", null, [
                  R[14] || (R[14] = c("dt", null, "支付工资", -1)),
                  c("dd", null, [
                    c("img", {
                      src: o("img_s4TeaUI_rewardpng"),
                      alt: "奶茶券"
                    }, null, 8, eu),
                    fe(" +" + $(S.wages?.final_wage || 0), 1)
                  ])
                ]),
                c("div", null, [
                  R[15] || (R[15] = c("dt", null, "互动收益", -1)),
                  c("dd", null, $(S.interact ? S.interact.success ? "互动成功" : "互动未成功" : "无互动"), 1)
                ])
              ])
            ]))), 128))
          ], 64)) : (g(), m("p", Ka, $(e.busy ? "加载中…" : e.error ? "营业记录读取失败" : "暂无营业记录"), 1))
        ])) : e.kind === "rank" ? (g(), m("div", tu, [
          R[18] || (R[18] = c("header", null, [
            c("span", null, "排名"),
            c("span", null, "玩家")
          ], -1)),
          c("div", su, [
            e.records?.ranks?.length ? X("", !0) : (g(), m("p", nu, $(e.busy ? "加载中…" : e.error ? "排行榜读取失败" : "暂无排行"), 1)),
            (g(!0), m(j, null, ne(e.records?.ranks || [], (S) => (g(), m("article", {
              key: S.owner.gid,
              class: "rank-row"
            }, [
              c("b", {
                class: Se(["rank-number", `place-${S.rank}`])
              }, $(S.rank), 3),
              c("div", iu, [
                I(S.owner.avatar) ? (g(), m("img", {
                  key: 0,
                  src: I(S.owner.avatar),
                  alt: ""
                }, null, 8, lu)) : (g(), m("span", ru, $(S.owner.name?.slice(0, 1)), 1)),
                c("b", null, $(S.owner.level), 1)
              ]),
              c("div", ou, [
                c("strong", null, $(S.owner.name), 1),
                c("p", null, "▰ " + $(S.shop_name), 1),
                c("p", null, [
                  R[17] || (R[17] = fe("营业额：", -1)),
                  c("em", null, $(S.total_revenue), 1)
                ])
              ]),
              S.can_show_off ? (g(), m("button", {
                key: 0,
                class: "native-button",
                onClick: re
              }, " 炫耀 ")) : X("", !0)
            ]))), 128))
          ])
        ])) : e.kind === "share" && e.state.share ? (g(), m(j, { key: 6 }, [
          c("img", {
            class: "share-title",
            src: o("img_s4HappyShare_title"),
            alt: "快乐不独享"
          }, null, 8, au),
          c("img", {
            class: "share-subtitle",
            src: o("img_happyShare_subTitle_bg"),
            alt: "点好友快乐包链接，攒快乐值领人气装饰"
          }, null, 8, uu),
          c("p", cu, " ◷ 剩余：" + $(y.value), 1),
          c("button", {
            class: "share-log",
            onClick: re
          }, [
            c("img", {
              src: o("btn_s4HappyShare_log"),
              alt: "领取日志"
            }, null, 8, fu)
          ]),
          c("img", {
            class: "popular-decoration",
            src: o("img_happyShare_good_bg"),
            alt: "人气装饰"
          }, null, 8, du),
          c("div", hu, [
            R[19] || (R[19] = fe(" 我的快乐值：", -1)),
            c("strong", null, "☀ " + $(A.value), 1)
          ]),
          c("div", pu, [
            (g(!0), m(j, null, ne(w.value, (S) => (g(), m("div", {
              key: S.tier_id,
              class: "milestone"
            }, [
              c("div", gu, [
                (g(!0), m(j, null, ne(S.rewards, (he) => (g(), dt(Dt, {
                  key: he.id,
                  item: he
                }, null, 8, ["item"]))), 128))
              ]),
              Number(S.state) !== 2 ? (g(), m("img", {
                key: 0,
                class: "tier-state",
                src: o(Number(S.state) === 3 ? "icon_s4_upLvReward_got" : "icon_s4_upLvReward_lock"),
                alt: Number(S.state) === 3 ? "已领取" : "未达成"
              }, null, 8, mu)) : X("", !0),
              c("b", null, $(S.threshold), 1)
            ]))), 128)),
            c("div", vu, [
              c("i", {
                style: be({ width: `${P.value}%` })
              }, null, 4)
            ])
          ]),
          c("p", _u, " 快乐包已被领" + $(e.state.share?.my_pool?.claimed_count || 0) + "/" + $(e.state.share?.my_pool?.claim_limit ?? "—"), 1),
          c("div", bu, [
            c("button", { onClick: re }, " 分享快乐 "),
            c("button", {
              disabled: e.busy || e.state.share?.daily?.daily_reward_claimed,
              onClick: R[3] || (R[3] = (S) => n("action", "shareDaily"))
            }, $(e.state.share?.daily?.daily_reward_claimed ? "今日已领取" : "每日领取"), 9, yu)
          ]),
          w.value.some((S) => Number(S.state) === 2) ? (g(), m("button", {
            key: 0,
            class: "milestone-claim",
            disabled: e.busy,
            onClick: R[4] || (R[4] = (S) => n("action", "shareRewards"))
          }, " 领取快乐值奖励 ", 8, xu)) : X("", !0)
        ], 64)) : e.kind === "fund" && e.state.fund ? (g(), m(j, { key: 7 }, [
          c("img", {
            class: "fund-banner",
            src: o("img_S4_upLvReward_banner"),
            alt: "解锁基金且店铺等级达标后可领取奖励"
          }, null, 8, ku),
          c("div", wu, [
            (g(!0), m(j, null, ne(e.state.fund?.tiers || [], (S) => (g(), m("article", {
              key: S.tier_id,
              class: Se({ reached: Number(e.state.shop?.level) >= Number(S.conditions?.[0]?.target_value || S.tier_id) })
            }, [
              c("b", $u, [
                fe($(S.conditions?.[0]?.target_value || S.tier_id), 1),
                R[20] || (R[20] = c("small", null, "等级", -1))
              ]),
              c("div", Su, [
                c("div", {
                  class: "rewards",
                  style: be({ "--reward-columns": Math.min(4, S.reward.length) })
                }, [
                  (g(!0), m(j, null, ne(S.reward, (he) => (g(), dt(Dt, {
                    key: he.id,
                    item: he
                  }, null, 8, ["item"]))), 128))
                ], 4),
                !e.state.fund?.unlocked || Number(S.state) !== 2 ? (g(), m("img", {
                  key: 0,
                  src: o(Number(S.state) === 3 ? "icon_s4_upLvReward_got" : "icon_s4_upLvReward_lock"),
                  alt: Number(S.state) === 3 ? "已领取" : "未解锁"
                }, null, 8, Cu)) : (g(), m("button", {
                  key: 1,
                  class: "native-button",
                  disabled: e.busy,
                  onClick: R[5] || (R[5] = (he) => n("action", "fundRewards"))
                }, " 领取 ", 8, Tu))
              ])
            ], 2))), 128))
          ]),
          e.state.fund?.unlocked ? (g(), m("button", {
            key: 0,
            class: "paint-button fund-submit",
            disabled: e.busy || !e.state.fund?.tiers?.some((S) => Number(S.state) === 2),
            onClick: R[6] || (R[6] = (S) => n("action", "fundRewards"))
          }, $(e.state.fund?.tiers?.some((S) => Number(S.state) === 2) ? "领取奖励" : "暂无可领取奖励"), 9, Mu)) : (g(), m("button", Eu, " 未购买 · 💎 " + $(e.state.fund?.unlock_cost?.find((S) => String(S.id) === "1004")?.count ?? "—"), 1))
        ], 64)) : (g(), m("p", Iu, " 暂无活动数据 ")),
        l.value ? (g(), m("p", Au, $(l.value), 1)) : X("", !0)
      ], 10, xa)
    ]));
  }
}), Ou = /* @__PURE__ */ Rs(Nu, [["__scopeId", "data-v-fc259983"]]), Ru = "万", Pu = "亿", oi = 1e4, ai = 1e8;
function Fu(e) {
  const t = Number(e ?? 0);
  return Number.isFinite(t) ? t : 0;
}
function Du(e) {
  const t = Fu(e), s = Math.abs(t);
  return s >= ai ? `${(t / ai).toFixed(2)}${Pu}` : s >= oi ? `${(t / oi).toFixed(2)}${Ru}` : t.toLocaleString("zh-CN");
}
const Lu = {
  key: 0,
  class: "milk-message"
}, Bu = {
  key: 1,
  class: "milk-message"
}, Hu = {
  key: 2,
  class: "milk-message"
}, Uu = {
  key: 3,
  class: "milk-error",
  role: "alert"
}, ju = { class: "milk-header" }, Vu = ["src"], Ku = ["src"], Wu = { class: "countdown" }, qu = { class: "countdown-time" }, Gu = { class: "balances" }, zu = { key: 0 }, Ju = ["src"], Yu = ["src"], Qu = { key: 1 }, Xu = ["src"], Zu = {
  key: 0,
  class: "shop-scene"
}, ec = { class: "shop-level" }, tc = ["src"], sc = ["src"], nc = ["src"], ic = { class: "drink-shelf" }, lc = ["src", "alt"], rc = { class: "locked-cup" }, oc = ["src"], ac = { class: "selling" }, uc = ["disabled"], cc = { class: "cashier-orb" }, fc = ["src"], dc = { class: "employees" }, hc = {
  key: 1,
  class: "employee locked-worker"
}, pc = ["src"], gc = ["src"], mc = { class: "shop-actions" }, vc = ["src"], _c = ["src"], bc = ["src"], yc = ["src"], xc = ["disabled"], kc = ["disabled"], wc = {
  key: 1,
  class: "shop-scene"
}, $c = ["disabled"], Sc = { class: "shop-filters" }, Cc = ["onClick"], Tc = { class: "goods-grid" }, Mc = ["onClick"], Ec = ["src", "alt"], Ic = {
  key: 0,
  class: "goods-lock"
}, Ac = { key: 1 }, Nc = {
  key: 2,
  class: "goods-costs"
}, Oc = ["src", "alt"], Rc = { key: 1 }, Pc = { class: "work-scene" }, Fc = ["src"], Dc = { class: "interactions" }, Lc = ["disabled", "onClick"], Bc = {
  key: 2,
  class: "empty-work"
}, Hc = ["src"], Uc = ["disabled"], jc = ["onClick"], Vc = ["src", "alt"], Kc = { class: "milk-modal" }, Wc = ["disabled"], qc = { class: "purchase-product" }, Gc = ["src", "alt"], zc = { class: "purchase-controls" }, Jc = ["disabled"], Yc = ["max", "disabled"], Qc = ["disabled"], Xc = ["disabled"], Zc = ["max", "disabled"], ef = { class: "purchase-limit" }, tf = { class: "purchase-costs" }, sf = ["src", "alt"], nf = { key: 1 }, lf = ["disabled", "onClick"], rf = { key: 0 }, of = ["disabled", "onClick"], af = ["src"], uf = /* @__PURE__ */ Es({
  __name: "MilkTeaActivityPanel",
  props: {
    host: {}
  },
  emits: ["back"],
  setup(e, { emit: t }) {
    const s = e, n = t, i = ue(() => s.host || {});
    function l(O = Date.now()) {
      const v = i.value.window || { startMs: 0, endMs: Number.MAX_SAFE_INTEGER };
      return O >= v.startMs && O <= v.endMs;
    }
    const o = /* @__PURE__ */ ve(null), a = /* @__PURE__ */ ve("100%");
    let f, h;
    function d() {
      h === void 0 && (h = requestAnimationFrame(() => {
        h = void 0, _();
      }));
    }
    function _() {
      if (!o.value)
        return;
      let O = o.value.parentElement;
      for (; O && !/auto|scroll/.test(getComputedStyle(O).overflowY); )
        O = O.parentElement;
      if (!O)
        return;
      const v = O.getBoundingClientRect(), r = Number.parseFloat(getComputedStyle(O).paddingBottom) || 0, u = o.value.getBoundingClientRect().top + O.scrollTop, p = Array.from(o.value.querySelectorAll(".milk-message, .milk-error")).reduce((k, T) => k + T.getBoundingClientRect().height, 0), C = Math.max(0, v.top + O.clientHeight - r - u - p), b = `${Math.floor(Math.min(620, o.value.clientWidth, C * 900 / 1600))}px`;
      a.value !== b && (a.value = b);
    }
    const A = /* @__PURE__ */ ve(String(i.value.getAccountId?.() || "")), w = /* @__PURE__ */ ve(null), P = /* @__PURE__ */ ve(!1), y = /* @__PURE__ */ ve(!1), F = /* @__PURE__ */ ve(""), U = /* @__PURE__ */ ve("shop"), q = /* @__PURE__ */ ve("全部"), L = /* @__PURE__ */ ve(""), I = /* @__PURE__ */ ve(1), re = ue(() => w.value?.goods?.find((O) => `goods:${O.id}` === L.value)), D = ue(() => Math.max(0, Number(re.value?.maxPurchasable || 0))), R = ue(() => Number.isSafeInteger(I.value) && I.value >= 1 && I.value <= D.value);
    kt(L, () => {
      I.value = 1;
    }), kt(D, (O) => {
      I.value > O && (I.value = Math.max(1, O));
    });
    function S() {
      I.value = Math.min(Math.max(1, D.value), Math.max(1, Math.floor(Number(I.value) || 1)));
    }
    function he(O) {
      return (BigInt(O.count || 0) * BigInt(Number.isSafeInteger(I.value) && I.value >= 1 ? I.value : 0)).toString();
    }
    const oe = /* @__PURE__ */ ve(null), tt = /* @__PURE__ */ ve("奶茶冲鸭"), st = /* @__PURE__ */ ve(Date.now());
    let ct, ge = 0;
    const z = (O) => `/activity/milk-tea/${O}.png`, ae = (O) => ({ 1001: "/game-config/resource-icons/gold.png", 1004: "/game-config/resource-icons/diamond.png", 1041: z("icon_s4_ticket") })[String(O.id ?? O.itemId)] || O.image || "", ee = (O) => Du(O ?? 0), Y = (O) => ee(w.value?.balances?.find((v) => String(v.itemId ?? v.id) === O)?.count || "0"), nt = ue(() => (w.value?.goods || []).filter((O) => q.value === "全部" || (q.value === "种子" ? O.category_tag === "seed" : O.category_tag !== "seed"))), St = ue(() => (w.value?.recipes || []).filter((O) => O.unlocked).sort((O, v) => Number(O.recipe_id) - Number(v.recipe_id))), Ue = ue(() => [...St.value].sort((O, v) => +(v.stock_cups === "-1") - +(O.stock_cups === "-1") || Number(v.recipe_id) - Number(O.recipe_id))), Ee = ue(() => {
      const O = Math.max(0, (Number(w.value?.endTime || 0) * 1e3 - st.value) / 1e3);
      return `${Math.floor(O / 86400)}天${Math.floor(O % 86400 / 3600)}时`;
    }), mt = (O) => new Date(O * 1e3).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: !1 }), At = (O) => `${Math.floor(Math.max(0, O) / 3600).toString().padStart(2, "0")}:${Math.floor(Math.max(0, O) % 3600 / 60).toString().padStart(2, "0")}`;
    async function Nt() {
      if (P.value || y.value || !A.value || !l())
        return;
      const O = ge;
      P.value = !0;
      try {
        const { data: v } = await i.value.api.get("/api/activity/milk-tea", { headers: { "x-account-id": A.value }, timeout: 1e5 });
        if (O !== ge)
          return;
        if (!v.ok || !v.activity)
          throw new Error(v.error || "活动数据读取失败");
        w.value = v.activity, F.value = "";
      } catch (v) {
        O === ge && (F.value = v.response?.data?.error || v.message);
      } finally {
        O === ge && (P.value = !1);
      }
    }
    async function Te(O, v = {}) {
      if (y.value || P.value || !A.value)
        return;
      const r = ge;
      y.value = !0, F.value = "";
      try {
        const { data: u } = await i.value.api.post("/api/activity/milk-tea/operate", { action: O, params: v }, { headers: { "x-account-id": A.value }, timeout: 19e4 });
        if (r !== ge)
          return;
        if (!u.ok)
          throw new Error(u.error || "操作失败");
        w.value = u.activity, ["shareDaily", "shareRewards", "fundRewards", "upgrade"].includes(O) || (L.value = "");
      } catch (u) {
        if (r === ge) {
          const p = u.response?.data?.error || u.message;
          F.value = O === "buy" && (u.code === "ECONNABORTED" || /timeout/i.test(p || "")) ? "兑换结果暂未确认，请等待数据刷新后核对库存和限购，勿重复提交" : p;
        }
      } finally {
        r === ge && (y.value = !1);
      }
    }
    async function pe(O) {
      if (y.value || (L.value = O, F.value = "", oe.value = null, !["sales", "rank", "hireList"].includes(O)))
        return;
      y.value = !0;
      const v = ge;
      try {
        const { data: r } = await i.value.api.post("/api/activity/milk-tea/records", { kind: O }, { headers: { "x-account-id": A.value }, timeout: 1e5 });
        if (!r.ok)
          throw new Error(r.error || "记录读取失败");
        v === ge && L.value === O && (oe.value = r);
      } catch (r) {
        v === ge && (F.value = r.response?.data?.error || r.message);
      } finally {
        v === ge && (y.value = !1);
      }
    }
    function Ot() {
      document.hidden || Nt();
    }
    return Wi(() => {
      f = new ResizeObserver(d);
      let O = o.value;
      for (; O; )
        f.observe(O), O = O.parentElement;
      window.addEventListener("resize", d), _(), Nt(), document.addEventListener("visibilitychange", Ot), ct = setInterval(() => {
        if (st.value = Date.now(), !l()) {
          clearInterval(ct), n("back");
          return;
        }
        document.hidden || Nt();
      }, 15e3);
    }), wn(() => {
      ge++, f?.disconnect(), window.removeEventListener("resize", d), h !== void 0 && cancelAnimationFrame(h), clearInterval(ct), document.removeEventListener("visibilitychange", Ot);
    }), (O, v) => (g(), m("div", {
      ref_key: "host_el",
      ref: o,
      class: "milk-host",
      style: be({ "--game-width": a.value })
    }, [
      A.value ? !w.value && P.value ? (g(), m("p", Bu, " 正在加载活动数据… ")) : !w.value && !F.value ? (g(), m("p", Hu, " 暂无活动数据 ")) : X("", !0) : (g(), m("p", Lu, " 请先选择账号 ")),
      F.value ? (g(), m("p", Uu, $(F.value), 1)) : X("", !0),
      w.value ? (g(), m("div", {
        key: 4,
        class: Se(["milk-game", U.value]),
        style: be({ backgroundImage: `url(${z(U.value === "shop" ? "img_s4_mainBg1" : "img_s4Main_bg")})` })
      }, [
        c("header", ju, [
          c("button", {
            class: "back image-button",
            onClick: v[0] || (v[0] = (r) => n("back"))
          }, [
            c("img", {
              src: z("img_s4Main_closeBtn"),
              alt: "返回"
            }, null, 8, Vu)
          ]),
          c("img", {
            class: "logo",
            src: z("img_s4Main_logo"),
            alt: "奶茶热销中"
          }, null, 8, Ku),
          c("div", Wu, [
            c("span", qu, [
              v[27] || (v[27] = c("svg", {
                viewBox: "0 0 32 36",
                fill: "none",
                "aria-hidden": "true"
              }, [
                c("path", {
                  d: "M12 2h8M16 2v4M25 7l2-2",
                  stroke: "currentColor",
                  "stroke-width": "3",
                  "stroke-linecap": "round"
                }),
                c("circle", {
                  cx: "16",
                  cy: "21",
                  r: "13",
                  stroke: "currentColor",
                  "stroke-width": "3"
                }),
                c("path", {
                  d: "M16 12v9l5 3",
                  stroke: "currentColor",
                  "stroke-width": "3",
                  "stroke-linecap": "round",
                  "stroke-linejoin": "round"
                })
              ], -1)),
              fe($(Ee.value), 1)
            ]),
            c("button", {
              "aria-label": "活动规则",
              onClick: v[1] || (v[1] = (r) => pe("rules"))
            }, " ? ")
          ]),
          c("div", Gu, [
            U.value === "exchange" ? (g(), m("div", zu, [
              c("img", {
                src: ae({ id: "1001" }),
                alt: "金币"
              }, null, 8, Ju),
              c("span", null, $(Y("1001")), 1)
            ])) : X("", !0),
            c("div", null, [
              c("img", {
                src: z("img_s4TeaUI_rewardpng"),
                alt: "奶茶券"
              }, null, 8, Yu),
              c("span", null, $(Y("1041")), 1)
            ]),
            U.value === "exchange" ? (g(), m("div", Qu, [
              c("img", {
                src: ae({ id: "1004" }),
                alt: "钻石"
              }, null, 8, Xu),
              c("span", null, $(Y("1004")), 1)
            ])) : X("", !0)
          ])
        ]),
        U.value === "shop" && w.value.shop ? (g(), m("main", Zu, [
          c("div", {
            class: "shop-sign",
            style: be({ backgroundImage: `url(${z("img_s4TeaUI_titleBg")})` })
          }, [
            c("div", ec, [
              c("b", null, $(w.value.shop.level), 1),
              v[28] || (v[28] = c("span", null, "店铺等级", -1))
            ]),
            c("div", null, [
              c("strong", null, $(w.value.summary.shop_name || "奶茶小铺"), 1),
              c("button", {
                class: "edit image-button",
                onClick: v[2] || (v[2] = (r) => pe("rename"))
              }, [
                c("img", {
                  src: z("img_s4TeaUI_editBtn"),
                  alt: "修改店名"
                }, null, 8, tc)
              ]),
              c("p", null, [
                v[29] || (v[29] = fe("营业额： ", -1)),
                c("img", {
                  class: "revenue-ticket",
                  src: z("img_s4TeaUI_rewardpng"),
                  alt: "奶茶券"
                }, null, 8, sc),
                fe(" " + $(ee(w.value.shop.total_revenue)), 1)
              ])
            ]),
            c("button", {
              class: "upgrade image-button",
              onClick: v[3] || (v[3] = (r) => pe("upgrade"))
            }, [
              c("img", {
                src: z("img_s4TeaUI_myShop"),
                alt: "店铺升级"
              }, null, 8, nc),
              v[30] || (v[30] = c("span", null, "店铺升级", -1))
            ])
          ], 4),
          c("div", ic, [
            (g(!0), m(j, null, ne(Ue.value, (r) => (g(), m("div", {
              key: r.recipe_id,
              class: "drink"
            }, [
              c("img", {
                src: r.config?.image || z("img_s4TeaUI_tea"),
                alt: r.recipe_name
              }, null, 8, lc),
              c("span", null, $(r.stock_cups === "-1" ? "不限量" : r.stock_cups), 1)
            ]))), 128)),
            (g(!0), m(j, null, ne(Math.max(0, 6 - Ue.value.length), (r) => (g(), m("div", {
              key: `locked-${r}`,
              class: "drink locked"
            }, [
              c("span", rc, [
                c("img", {
                  src: z("img_s4_v2_lock"),
                  alt: "未解锁"
                }, null, 8, oc)
              ])
            ]))), 128))
          ]),
          c("div", ac, $(w.value.phase === "settling" ? "结算期" : `正在热卖：每小时${w.value.shop.effective_cups_per_hour}杯`), 1),
          c("button", {
            class: "cashier image-button",
            disabled: y.value || !w.value.shop.pending_rewards.some((r) => Number(r.count) > 0),
            onClick: v[4] || (v[4] = (r) => Te("cashier"))
          }, [
            c("div", cc, [
              c("img", {
                src: z("img_s4TeaUI_rewardpng"),
                alt: "奶茶券"
              }, null, 8, fc),
              c("b", null, $(ee(w.value.shop.pending_rewards.find((r) => String(r.id) === "1041")?.count || "0")), 1)
            ]),
            v[31] || (v[31] = c("span", null, "领取收益", -1))
          ], 8, uc),
          c("div", dc, [
            (g(!0), m(j, null, ne(w.value.shop.slots, (r) => (g(), m("div", {
              key: r.slot_index,
              class: "employee"
            }, [
              c("strong", null, $(r.employee.name), 1),
              c("span", null, $(r.talent_name), 1),
              c("div", {
                class: "hamster",
                style: be({ backgroundImage: `url(${z("hamster-idle")})` })
              }, null, 4),
              c("b", null, $(At(Number(r.end_at) - st.value / 1e3)) + "后下班", 1)
            ]))), 128)),
            w.value.shop.slots.length ? X("", !0) : (g(), m("button", {
              key: 0,
              class: "employ",
              onClick: v[5] || (v[5] = (r) => pe("hireList"))
            }, " 雇佣员工 ")),
            Number(w.value.shop.level) < 3 ? (g(), m("div", hc, [
              c("img", {
                src: z("img_s4TeaUI_cangshu_empty"),
                alt: ""
              }, null, 8, pc),
              c("span", null, [
                c("img", {
                  src: z("img_s4_v2_lock"),
                  alt: "未解锁"
                }, null, 8, gc),
                v[32] || (v[32] = c("br", null, null, -1)),
                v[33] || (v[33] = fe("店铺3级解锁", -1))
              ])
            ])) : X("", !0)
          ]),
          c("aside", mc, [
            c("button", {
              class: "image-button",
              onClick: v[6] || (v[6] = (r) => pe("sales"))
            }, [
              c("img", {
                src: z("img_s4TeaUI_recordBtn"),
                alt: "营业记录"
              }, null, 8, vc),
              v[34] || (v[34] = c("span", null, "营业记录", -1))
            ]),
            c("button", {
              class: "image-button",
              onClick: v[7] || (v[7] = (r) => pe("rank"))
            }, [
              c("img", {
                src: z("img_s4TeaUI_rankBtn"),
                alt: "排行榜"
              }, null, 8, _c),
              v[35] || (v[35] = c("span", null, "排行榜", -1))
            ]),
            c("button", {
              class: "image-button",
              onClick: v[8] || (v[8] = (r) => pe("share"))
            }, [
              c("img", {
                src: z("img_s4TeaUI_shareBtn"),
                alt: "快乐不独享"
              }, null, 8, bc),
              v[36] || (v[36] = c("span", null, "快乐不独享", -1))
            ]),
            c("button", {
              class: "image-button",
              onClick: v[9] || (v[9] = (r) => pe("fund"))
            }, [
              c("img", {
                src: z("img_s4TeaUI_rewardBtn"),
                alt: "成长基金"
              }, null, 8, yc),
              v[37] || (v[37] = c("span", null, "成长基金", -1))
            ])
          ]),
          Number(w.value.summary.shop_open_at) ? (g(), m("button", {
            key: 1,
            class: "make gold-button",
            disabled: y.value || w.value.phase !== "business",
            onClick: v[11] || (v[11] = (r) => pe("craft"))
          }, [...v[38] || (v[38] = [
            c("span", {
              class: "make-cup",
              "aria-hidden": "true"
            }, null, -1),
            fe("制作奶茶 ", -1)
          ])], 8, kc)) : (g(), m("button", {
            key: 0,
            class: "make gold-button",
            disabled: y.value,
            onClick: v[10] || (v[10] = (r) => pe("create"))
          }, " 开店营业 ", 8, xc))
        ])) : U.value === "shop" ? (g(), m("main", wc, [
          c("button", {
            class: "make gold-button",
            disabled: y.value,
            onClick: v[12] || (v[12] = (r) => pe("create"))
          }, " 开店营业 ", 8, $c)
        ])) : U.value === "exchange" ? (g(), m("main", {
          key: 2,
          class: "paper exchange-paper",
          style: be({ backgroundImage: `url(${z("img_s4_commonBg")})` })
        }, [
          c("div", Sc, [
            (g(), m(j, null, ne(["全部", "种子", "装扮"], (r) => c("button", {
              key: r,
              class: Se({ selected: q.value === r }),
              onClick: (u) => q.value = r
            }, $(r), 11, Cc)), 64))
          ]),
          c("div", Tc, [
            (g(!0), m(j, null, ne(nt.value, (r) => (g(), m("button", {
              key: r.id,
              class: Se(["goods", { unavailable: !r.unlocked || !r.remaining }]),
              style: be({ backgroundImage: `url(${z(Number(r.background_type) >= 2 ? "img_s4Shop_itemBg3" : "img_s4Shop_itemBg1")})` }),
              onClick: (u) => pe(`goods:${r.id}`)
            }, [
              c("strong", null, $(r.name), 1),
              c("img", {
                src: r.items[0]?.image || r.items[0]?.imageUrl || z("img_exchange_item1"),
                alt: r.name
              }, null, 8, Ec),
              r.unlocked ? X("", !0) : (g(), m("span", Ic, [
                v[39] || (v[39] = fe("🔒", -1)),
                v[40] || (v[40] = c("br", null, null, -1)),
                fe("店铺" + $(r.cond_hints.find((u) => !u.satisfied)?.target) + "级解锁", 1)
              ])),
              c("small", null, $({ 1: "每日", 2: "每周", 4: "永久" }[r.restriction_type] || "") + "限购" + $(r.remaining) + "/" + $(r.purchase_limit), 1),
              r.remaining ? (g(), m("b", Nc, [
                (g(!0), m(j, null, ne(r.costs, (u) => (g(), m("span", {
                  key: u.id
                }, [
                  ae(u) ? (g(), m("img", {
                    key: 0,
                    src: ae(u),
                    alt: u.name
                  }, null, 8, Oc)) : (g(), m("span", Rc, $(u.name), 1)),
                  fe($(ee(u.count)), 1)
                ]))), 128))
              ])) : (g(), m("b", Ac, "已售罄"))
            ], 14, Mc))), 128))
          ])
        ], 4)) : (g(), m("main", {
          key: 3,
          class: "paper work-paper",
          style: be({ backgroundImage: `url(${z("img_s4_commonBg")})` })
        }, [
          c("div", Pc, [
            c("img", {
              src: z("img_S4MyJob_bg_3"),
              alt: ""
            }, null, 8, Fc),
            c("div", {
              class: "work-sign",
              style: be({ backgroundImage: `url(${z("img_S4MyJob_bg_4")})` })
            }, $(w.value.work.my_shift ? "工作中" : "空闲中"), 5)
          ]),
          w.value.work.my_shift ? (g(), m(j, { key: 0 }, [
            c("h3", null, $(w.value.work.my_shift.shop_name), 1),
            c("p", null, $(w.value.work.my_shift.talent_name) + " · " + $(At(Number(w.value.work.my_shift.end_at) - st.value / 1e3)) + "后下班", 1),
            c("div", Dc, [
              (g(!0), m(j, null, ne(w.value.interactions, (r) => (g(), m("button", {
                key: r.interaction_id,
                class: "gold-button",
                disabled: y.value || w.value.work.interact_done || w.value.phase !== "business",
                onClick: (u) => Te("interact", { interactionType: r.interaction_id })
              }, $(r.name), 9, Lc))), 128))
            ])
          ], 64)) : (g(), m("button", {
            key: 1,
            class: "gold-button invite",
            onClick: v[13] || (v[13] = (r) => pe("invite"))
          }, " ➤ 邀请好友雇佣我 ")),
          v[42] || (v[42] = c("h3", { class: "record-title" }, " 兼职记录 ", -1)),
          w.value.work.slips.length ? X("", !0) : (g(), m("div", Bc, [
            c("img", {
              src: z("img_s4_null1"),
              alt: ""
            }, null, 8, Hc),
            v[41] || (v[41] = c("p", null, "暂无工作记录", -1))
          ])),
          (g(!0), m(j, null, ne(w.value.work.slips, (r) => (g(), m("div", {
            key: r.shift_id,
            class: "work-record"
          }, [
            c("strong", null, $(r.shop_name), 1),
            c("p", null, $(mt(Number(r.begin_at))) + " — " + $(mt(Number(r.end_at))), 1)
          ]))), 128)),
          w.value.summary.has_unclaimed_wage ? (g(), m("button", {
            key: 3,
            class: "gold-button",
            disabled: y.value,
            onClick: v[14] || (v[14] = (r) => Te("wages"))
          }, " 领取工资 ", 8, Uc)) : X("", !0)
        ], 4)),
        c("nav", {
          class: "milk-tabs",
          style: be({ backgroundImage: `url(${z("img_s4Main_bottomBg")})` })
        }, [
          (g(), m(j, null, ne(["shop", "exchange", "work"], (r, u) => c("button", {
            key: r,
            class: Se({ active: U.value === r }),
            onClick: (p) => U.value = r
          }, [
            c("img", {
              src: z(`img_s4Main_${U.value === r ? "tabSelect" : "tab"}${[0, 2, 3][u]}`),
              alt: ["我的店铺", "兑换商店", "我的工作"][u]
            }, null, 8, Vc)
          ], 10, jc)), 64))
        ], 4),
        ["upgrade", "sales", "rank", "share", "fund"].includes(L.value) ? (g(), dt(Ou, {
          key: 4,
          kind: L.value,
          state: w.value,
          records: oe.value,
          busy: y.value,
          error: F.value,
          onClose: v[15] || (v[15] = (r) => L.value = ""),
          onAction: Te
        }, null, 8, ["kind", "state", "records", "busy", "error"])) : L.value === "craft" ? (g(), dt(ga, {
          key: 5,
          state: w.value,
          busy: y.value,
          loading: P.value,
          error: F.value,
          onClose: v[16] || (v[16] = (r) => L.value = ""),
          onCraft: v[17] || (v[17] = (r) => Te("craft", r))
        }, null, 8, ["state", "busy", "loading", "error"])) : L.value ? (g(), m("div", {
          key: 6,
          class: "modal-mask",
          onClick: v[26] || (v[26] = Cn((r) => L.value = "", ["self"]))
        }, [
          c("section", Kc, [
            c("button", {
              class: "modal-close",
              onClick: v[18] || (v[18] = (r) => L.value = "")
            }, " × "),
            L.value === "create" || L.value === "rename" ? (g(), m(j, { key: 0 }, [
              c("h2", null, $(L.value === "create" ? "开店营业" : "修改店名"), 1),
              Us(c("input", {
                "onUpdate:modelValue": v[19] || (v[19] = (r) => tt.value = r),
                maxlength: "8",
                "aria-label": "店名"
              }, null, 512), [
                [Js, tt.value]
              ]),
              c("button", {
                class: "gold-button",
                disabled: y.value,
                onClick: v[20] || (v[20] = (r) => Te(L.value, { shopName: tt.value }))
              }, " 确认 ", 8, Wc)
            ], 64)) : L.value.startsWith("goods:") ? (g(!0), m(j, { key: 1 }, ne(w.value.goods.filter((r) => `goods:${r.id}` === L.value), (r) => (g(), m(j, {
              key: r.id
            }, [
              v[43] || (v[43] = c("h2", null, "兑换", -1)),
              c("div", qc, [
                r.items[0]?.image ? (g(), m("img", {
                  key: 0,
                  src: r.items[0].image,
                  alt: r.name
                }, null, 8, Gc)) : X("", !0),
                c("div", null, [
                  c("strong", null, $(r.name), 1),
                  c("p", null, $(r.desc), 1)
                ])
              ]),
              c("div", zc, [
                c("button", {
                  "aria-label": "减少兑换数量",
                  disabled: y.value || I.value <= 1 || !D.value,
                  onClick: v[21] || (v[21] = (u) => I.value = Math.max(1, Number(I.value) - 1))
                }, " − ", 8, Jc),
                Us(c("input", {
                  "onUpdate:modelValue": v[22] || (v[22] = (u) => I.value = u),
                  type: "number",
                  min: "1",
                  max: Math.max(1, D.value),
                  step: "1",
                  "aria-label": "兑换数量",
                  disabled: y.value || !D.value,
                  onChange: S
                }, null, 40, Yc), [
                  [
                    Js,
                    I.value,
                    void 0,
                    { number: !0 }
                  ]
                ]),
                c("button", {
                  "aria-label": "增加兑换数量",
                  disabled: y.value || I.value >= D.value || !D.value,
                  onClick: v[23] || (v[23] = (u) => I.value = Math.min(D.value, Number(I.value) + 1))
                }, " ＋ ", 8, Qc),
                c("button", {
                  disabled: y.value || !D.value,
                  onClick: v[24] || (v[24] = (u) => I.value = D.value)
                }, " 最大 ", 8, Xc)
              ]),
              Us(c("input", {
                "onUpdate:modelValue": v[25] || (v[25] = (u) => I.value = u),
                class: "purchase-range",
                type: "range",
                min: "1",
                max: Math.max(1, D.value),
                step: "1",
                "aria-label": "滑动选择兑换数量",
                disabled: y.value || D.value <= 1
              }, null, 8, Zc), [
                [
                  Js,
                  I.value,
                  void 0,
                  { number: !0 }
                ]
              ]),
              c("p", ef, $({ 1: "每日", 2: "每周", 4: "永久" }[r.restriction_type] || "") + "剩余限购 " + $(r.remaining) + " · 当前最多可兑换 " + $(D.value), 1),
              c("div", tf, [
                (g(!0), m(j, null, ne(r.costs, (u) => (g(), m("span", {
                  key: u.id
                }, [
                  ae(u) ? (g(), m("img", {
                    key: 0,
                    src: ae(u),
                    alt: u.name
                  }, null, 8, sf)) : (g(), m("span", nf, $(u.name), 1)),
                  fe($(he(u)), 1)
                ]))), 128))
              ]),
              c("button", {
                class: "gold-button",
                disabled: y.value || P.value || !R.value || !r.unlocked || r.paid,
                onClick: (u) => Te("buy", { goodsId: r.id, count: I.value })
              }, $(r.paid ? "不支持钻石购买" : `兑换 ×${R.value ? I.value : 0}`), 9, lf)
            ], 64))), 128)) : L.value === "hireList" ? (g(), m(j, { key: 2 }, [
              v[44] || (v[44] = c("h2", null, "雇佣员工", -1)),
              oe.value ? X("", !0) : (g(), m("p", rf, $(y.value ? "加载中…" : "暂无可雇佣员工"), 1)),
              (g(!0), m(j, null, ne([...oe.value?.friends || [], ...oe.value?.robots || []], (r) => (g(), m("button", {
                key: r.friend.gid,
                class: "recipe-row",
                disabled: y.value || Number(r.state) !== 0,
                onClick: (u) => Te("hire", { targetGid: r.friend.gid, durationId: 1, slotIndex: 0 })
              }, $(r.friend.name) + " · " + $(r.talent_name) + " · 4小时 🎟" + $(oe.value.wage_total), 9, of))), 128))
            ], 64)) : L.value === "rules" ? (g(), m(j, { key: 3 }, [
              v[45] || (v[45] = c("h2", null, "活动说明", -1)),
              c("p", null, "营业期结束：" + $(mt(w.value.settleTime)), 1),
              c("p", null, "结算期结束：" + $(mt(w.value.endTime)), 1),
              c("img", {
                src: z("img_S4_rule1"),
                alt: "活动规则",
                style: { width: "100%" }
              }, null, 8, af)
            ], 64)) : (g(), m(j, { key: 4 }, [
              c("h2", null, $({ invite: "邀请好友雇佣我", share: "快乐不独享", fund: "成长基金" }[L.value]), 1),
              c("p", null, $(L.value === "fund" ? "付费基金暂不支持在网页购买" : "此功能需要 QQ 原生分享"), 1)
            ], 64))
          ])
        ])) : X("", !0)
      ], 6)) : X("", !0)
    ], 4));
  }
}), cf = /* @__PURE__ */ Rs(uf, [["__scopeId", "data-v-7593d020"]]);
function ff(e, t = {}) {
  const s = Ho({
    render: () => co(cf, {
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
const df = { mount: ff };
export {
  df as default,
  ff as mount
};
