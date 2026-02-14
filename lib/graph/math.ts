export function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x))
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export function variance(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  let s = 0
  for (const x of xs) s += (x - m) * (x - m)
  return s / (xs.length - 1)
}

/**
 * Solve A x = b for x using Gauss-Jordan elimination with partial pivoting.
 * Mutates A and b internally (copies are made by the caller below).
 */
export function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length
  if (n === 0) return []
  const m = A[0].length
  if (m !== n) throw new Error('solveLinearSystem requires a square matrix')
  if (b.length !== n) throw new Error('solveLinearSystem b length mismatch')

  // Build augmented matrix
  const M = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    // Pivot
    let pivotRow = col
    let pivotVal = Math.abs(M[col][col])
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(M[r][col])
      if (v > pivotVal) {
        pivotVal = v
        pivotRow = r
      }
    }
    if (pivotVal === 0) {
      // Singular; return zeros rather than exploding
      return new Array(n).fill(0)
    }
    if (pivotRow !== col) {
      const tmp = M[col]
      M[col] = M[pivotRow]
      M[pivotRow] = tmp
    }

    // Normalize pivot row
    const pivot = M[col][col]
    for (let c = col; c <= n; c++) M[col][c] /= pivot

    // Eliminate other rows
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = M[r][col]
      if (factor === 0) continue
      for (let c = col; c <= n; c++) {
        M[r][c] -= factor * M[col][c]
      }
    }
  }

  return M.map((row) => row[n])
}

export function ridgeRegression(X: number[][], y: number[], lambda: number): number[] {
  const n = X.length
  if (n === 0) return []
  const p = X[0].length

  // XtX
  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0))
  const Xty: number[] = new Array(p).fill(0)

  for (let i = 0; i < n; i++) {
    const xi = X[i]
    const yi = y[i]
    for (let a = 0; a < p; a++) {
      Xty[a] += xi[a] * yi
      for (let b = 0; b < p; b++) {
        XtX[a][b] += xi[a] * xi[b]
      }
    }
  }

  // Add ridge penalty to diagonal (including intercept for stability)
  for (let d = 0; d < p; d++) XtX[d][d] += lambda

  return solveLinearSystem(XtX, Xty)
}






