/**
 * 阿里云 OpenAPI 客户端（纯 REST 调用，无 SDK 依赖）
 * 签名算法：V1.0 HMAC-SHA1，逻辑与 old.js 保持一致
 */

const ECS_API_VERSION = '2014-05-26';
const CDT_API_VERSION = '2021-08-13';
const CDT_HOST = 'cdt.aliyuncs.com';

export class AliyunApiError extends Error {
  constructor(message, { code, requestId, status } = {}) {
    super(message);
    this.name = 'AliyunApiError';
    this.code = code;
    this.requestId = requestId;
    this.status = status;
  }
}

/** URL 编码（符合阿里云签名要求） */
export function encode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

/** HMAC-SHA1 签名，使用 Web Crypto API */
export async function hmacSha1(key, message) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  let binary = '';
  const bytes = new Uint8Array(signature);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function buildNonce() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

/**
 * 调用阿里云 RPC 风格 OpenAPI
 * @param {{host:string, version:string, params:Record<string,string>, accessKeyId:string, accessKeySecret:string}} options
 */
export async function callAliyunApi({ host, version, params = {}, accessKeyId, accessKeySecret }) {
  const commonParams = {
    Format: 'JSON',
    Version: version,
    AccessKeyId: accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    Timestamp: new Date().toISOString().replace(/\.\d{3}/, ''),
    SignatureVersion: '1.0',
    SignatureNonce: buildNonce(),
  };

  const allParams = { ...commonParams, ...params };
  const canonicalQueryString = Object.keys(allParams)
    .sort()
    .map((key) => `${encode(key)}=${encode(allParams[key])}`)
    .join('&');

  const stringToSign = `GET&${encode('/')}&${encode(canonicalQueryString)}`;
  const signature = await hmacSha1(`${accessKeySecret}&`, stringToSign);
  const url = `https://${host}/?${canonicalQueryString}&Signature=${encode(signature)}`;

  let response;
  try {
    response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  } catch (e) {
    throw new AliyunApiError(`网络请求失败：${e.message}`, { status: 0 });
  }

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AliyunApiError(`接口返回内容无法解析（HTTP ${response.status}）`, { status: response.status });
  }

  if (json.Code && json.Message && json.Code !== '200') {
    throw new AliyunApiError(json.Message, {
      code: json.Code,
      requestId: json.RequestId,
      status: response.status,
    });
  }

  if (!response.ok) {
    throw new AliyunApiError(`接口请求失败（HTTP ${response.status}）`, { status: response.status });
  }

  return json;
}

/** 查询实例详情 */
export function describeInstance(credential, { instanceId, regionId }) {
  return callAliyunApi({
    host: `ecs.${regionId}.aliyuncs.com`,
    version: ECS_API_VERSION,
    accessKeyId: credential.accessKeyId,
    accessKeySecret: credential.accessKeySecret,
    params: {
      Action: 'DescribeInstances',
      RegionId: regionId,
      InstanceIds: JSON.stringify([instanceId]),
    },
  });
}

/** 开机 */
export function startInstance(credential, { instanceId, regionId }) {
  return callAliyunApi({
    host: `ecs.${regionId}.aliyuncs.com`,
    version: ECS_API_VERSION,
    accessKeyId: credential.accessKeyId,
    accessKeySecret: credential.accessKeySecret,
    params: {
      Action: 'StartInstance',
      InstanceId: instanceId,
      RegionId: regionId,
    },
  });
}

/** 强制关机 + 节省停机模式 */
export function stopInstance(credential, { instanceId, regionId }) {
  return callAliyunApi({
    host: `ecs.${regionId}.aliyuncs.com`,
    version: ECS_API_VERSION,
    accessKeyId: credential.accessKeyId,
    accessKeySecret: credential.accessKeySecret,
    params: {
      Action: 'StopInstance',
      InstanceId: instanceId,
      RegionId: regionId,
      ForceStop: 'true',
      StoppedMode: 'StopCharging',
    },
  });
}

/** 查询账号维度 CDT 当月累计公网流量 */
export function listCdtInternetTraffic(credential) {
  return callAliyunApi({
    host: CDT_HOST,
    version: CDT_API_VERSION,
    accessKeyId: credential.accessKeyId,
    accessKeySecret: credential.accessKeySecret,
    params: { Action: 'ListCdtInternetTraffic' },
  });
}
