/**
 * 时间戳显示工具。
 *
 * 这套数据里的时间戳来源很杂：老代码存过秒（`Math.floor(Date.now()/1000)`），
 * 新代码存毫秒（`Date.now()`）。直接乘 1000 会得到「58822 年」这种鬼日期，
 * 所以统一走这里判断一次。
 */

/** 毫秒时间戳的量级下限（2001-09-09 之后）。小于它的一律按「秒」理解。 */
const MILLISECOND_FLOOR = 1e12

/**
 * 把可能是「秒」也可能是「毫秒」的时间戳转成 Date。
 * @param value 时间戳，0 / 空值返回 null
 */
export function parseEpoch(value: number | string | null | undefined): Date | null {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0)
    return null
  return new Date(num < MILLISECOND_FLOOR ? num * 1000 : num)
}

/** 补零 */
export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 格式化成 `YYYY-MM-DD HH:mm`（本地时区）。取不到返回空串，交给调用方决定文案。
 */
export function formatEpochMinute(value: number | string | null | undefined): string {
  const date = parseEpoch(value)
  if (!date)
    return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}
