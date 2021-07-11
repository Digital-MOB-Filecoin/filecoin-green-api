const BN = require('bn.js')


function bytesToBigRev (p) {
    let acc = new BN(0)
    for (let i = 0; i < p.length; i++) {
      acc = acc.mul(new BN(256))
      acc = acc.add(new BN(p[p.length - i - 1]))
    }
    return acc
  }
  
  function nextBits (obj, n) {
    // if (obj.left < n) throw new Error("out of bits")
    const res = obj.num.and(new BN(1).shln(n).sub(new BN(1)))
    obj.num = obj.num.shrn(n)
    obj.left -= n
    return res.toNumber()
  }
  
  function decodeRLE (buf) {
    const obj = {
      left: 8 * buf.length,
      num: bytesToBigRev(buf)
    }
    const version = nextBits(obj, 2)
    const first = nextBits(obj, 1)
    const res = []
    while (obj.left > 0) {
      let b1 = nextBits(obj, 1)
      if (b1 === 1) {
        res.push(1)
        continue
      }
      let b2 = nextBits(obj, 1)
      if (b2 === 1) {
        const a = nextBits(obj, 4)
        res.push(a)
        continue
      }
      let x = 0
      let s = 0
      for (let i = 0; true; i++) {
        if (i === 10) {
          throw new Error('run too long')
        }
        let b = nextBits(obj, 8)
        if (b < 0x80) {
          if (i > 9 || (i === 9 && b > 1)) {
            throw new Error('run too long')
          } else if (b === 0 && s > 0) {
            throw new Error('invalid run')
          }
          x |= b << s
          break
        }
        x |= (b & 0x7f) << s
        s += 7
      }
      res.push(x)
    }
    return { first, runs: res }
  }
  
  function decodeRLE2 (buf) {
    const { first, runs } = decodeRLE(buf)
    let cur = first
    const res = []
    let acc = 0
    for (let r of runs) {
      for (let i = 0; i < r; i++) {
        if (cur === 1) res.push(acc)
        acc++
      }
      cur = 1 - cur
    }
    return res
  }
  
  function decodeRLE3 (runs) {
    let cur = 0
    const res = []
    let acc = 0
    for (let r of runs) {
      for (let i = 0; i < r; i++) {
        if (cur === 1) res.push(acc)
        acc++
      }
      cur = 1 - cur
    }
    return res
  }

  module.exports = {
    decodeRLE2
  };