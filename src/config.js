/**
 * 环境变量解析：支持多组 ECS 配置
 *
 * 多组配置以英文分号(;)分隔（兼容全角分号），各环境变量的第 N 项严格按顺序一一对应：
 *   ALIBABA_CLOUD_ACCESS_KEY_ID     = "LTAI5tAAA;LTAI5tBBB"
 *   ALIBABA_CLOUD_ACCESS_KEY_SECRET = "secretAAA;secretBBB"
 *   INSTANCE_ID                     = "i-aaa;i-bbb"
 *   REGION_ID                       = "cn-hangzhou;cn-shenzhen"   ← 可省略/留空，默认 cn-hangzhou
 */

const SEPARATOR = /[;；]/;
const DEFAULT_REGION = 'cn-hangzhou';

export class ConfigError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

function toList(value) {
  if (value === undefined || value === null) return [];
  const text = String(value).trim();
  if (text === '') return [];
  return text.split(SEPARATOR).map((item) => item.trim());
}

/**
 * 解析并校验多组 ECS 配置
 * @returns {Array<{index:number, accessKeyId:string, accessKeySecret:string, instanceId:string, regionId:string}>}
 */
export function parseEcsConfigs(env = {}) {
  const accessKeyIds = toList(env.ALIBABA_CLOUD_ACCESS_KEY_ID);
  const accessKeySecrets = toList(env.ALIBABA_CLOUD_ACCESS_KEY_SECRET);
  const instanceIds = toList(env.INSTANCE_ID);
  const regionIds = toList(env.REGION_ID);

  const total = Math.max(
    accessKeyIds.length,
    accessKeySecrets.length,
    instanceIds.length,
    regionIds.length,
  );

  if (total === 0) {
    throw new ConfigError('未配置任何 ECS 实例', [
      '请至少配置一组 ALIBABA_CLOUD_ACCESS_KEY_ID、ALIBABA_CLOUD_ACCESS_KEY_SECRET 与 INSTANCE_ID。',
      '多组配置请使用英文分号 ; 分隔，各变量中的参数按顺序一一对应。',
    ]);
  }

  const issues = [];
  const checkLength = (name, list) => {
    if (list.length !== total) {
      issues.push(`${name} 需要 ${total} 项，当前为 ${list.length} 项`);
    }
  };

  checkLength('ALIBABA_CLOUD_ACCESS_KEY_ID', accessKeyIds);
  checkLength('ALIBABA_CLOUD_ACCESS_KEY_SECRET', accessKeySecrets);
  checkLength('INSTANCE_ID', instanceIds);
  if (regionIds.length > total) {
    issues.push(`REGION_ID 最多 ${total} 项，当前为 ${regionIds.length} 项`);
  }

  const configs = [];
  // 数量已不一致时不再逐组报缺项，避免产生噪声提示
  if (issues.length === 0) {
    for (let index = 0; index < total; index += 1) {
      const missing = [];
      if (!accessKeyIds[index]) missing.push('ALIBABA_CLOUD_ACCESS_KEY_ID');
      if (!accessKeySecrets[index]) missing.push('ALIBABA_CLOUD_ACCESS_KEY_SECRET');
      if (!instanceIds[index]) missing.push('INSTANCE_ID');

      if (missing.length > 0) {
        issues.push(`第 ${index + 1} 组缺少 ${missing.join('、')}`);
        continue;
      }

      configs.push({
        index,
        accessKeyId: accessKeyIds[index],
        accessKeySecret: accessKeySecrets[index],
        instanceId: instanceIds[index],
        regionId: regionIds[index] || DEFAULT_REGION,
      });
    }
  }

  if (issues.length > 0) {
    throw new ConfigError('ECS 配置校验失败', issues);
  }

  return configs;
}

/** 读取访问密码，未配置时返回空字符串（调用方须拒绝一切访问） */
export function readPassword(env = {}) {
  if (env.PASSWORD === undefined || env.PASSWORD === null) return '';
  return String(env.PASSWORD).trim();
}
