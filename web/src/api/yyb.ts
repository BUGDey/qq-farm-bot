/**
 * YYB API 模块
 * 用于从YYB系统获取微信登录Code
 *
 * 注意：使用后端代理模式，前端调用本地API，由后端服务器代理请求到YYB服务
 */

import api from './index'

/**
 * YYB 请求参数接口
 */
interface YYBRequestParams {
  app_id: string
  ref: string
}

/**
 * YYB 响应接口
 */
interface YYBResponse {
  ok: boolean
  data?: {
    code: string
    openid?: string
  }
  error?: string
}

/**
 * 从YYB获取微信登录Code
 * 通过后端代理请求YYB服务，避免CORS跨域问题
 * @param params 请求参数，包含app_id和ref
 * @returns Promise<string> 返回获取到的code值
 * @throws Error 当请求失败或响应格式不正确时抛出错误
 */
export async function getCodeFromYYB(params: YYBRequestParams): Promise<string> {
  try {
    // 调用本地后端代理API
    const response = await api.post<YYBResponse>('/api/yyb/getCode', params)

    // 验证响应数据
    if (!response.data) {
      throw new Error('YYB服务响应为空')
    }

    // 检查业务状态
    if (!response.data.ok) {
      throw new Error(response.data.error || 'YYB服务返回错误')
    }

    // 提取code值
    const code = response.data.data?.code
    if (!code) {
      throw new Error('YYB服务未返回有效的code')
    }

    return code
  }
  catch (error: any) {
    // 统一错误处理
    if (error.response) {
      // HTTP错误响应
      const status = error.response.status
      const message = error.response.data?.error
        || error.response.data?.message
        || error.message

      throw new Error(`YYB服务请求失败 (${status}): ${message}`)
    }
    else if (error.request) {
      // 请求已发送但无响应
      throw new Error('YYB服务无网络连接')
    }
    else {
      // 其他错误
      throw new Error(error.message || 'YYB服务请求失败')
    }
  }
}

/**
 * 默认的YYB请求参数
 * 可以被外部覆盖
 */
export const DEFAULT_YYB_PARAMS: YYBRequestParams = {
  app_id: 'wx5306c5978fdb76e4',
  ref: 'owNAX6jwFkXhX-IzVAr7a1F0b56c',
}
