/**
 * 业务层：并发聚合多个账号下 ECS 实例的状态与 CDT 流量，并提供开机/关机操作
 */

import {
  describeInstance,
  listCdtInternetTraffic,
  startInstance,
  stopInstance,
} from './aliyun.js';

export class ActionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ActionError';
  }
}

/** CDT 流量接口结果缓存时长（账号维度，同一 AK 的多台实例共用一次请求） */
const CDT_CACHE_TTL = 60 * 1000;
const CDT_CACHE_MAX_ENTRIES = 32;
const cdtCache = new Map();

const STATUS_META = {
  Running: { label: '运行中', tone: 'running', color: '#52c41a' },
  Starting: { label: '启动中', tone: 'pending', color: '#1890ff' },
  Stopping: { label: '停止中', tone: 'pending', color: '#faad14' },
  Stopped: { label: '已停止', tone: 'stopped', color: '#f5222d' },
  Pending: { label: '创建中', tone: 'pending', color: '#8c8c8c' },
  Rebooting: { label: '重启中', tone: 'pending', color: '#1890ff' },
};

const UNKNOWN_STATUS = { label: '未知', tone: 'unknown', color: '#8c8c8c' };

const ACTION_LABELS = {
  start: '开机',
  stop: '强制关机（节省停机模式）',
};

function getStatusMeta(status) {
  return STATUS_META[status] || { ...UNKNOWN_STATUS, label: status || UNKNOWN_STATUS.label };
}

function firstIp(value) {
  if (!value) return '';
  if (Array.isArray(value)) {
    const found = value.find((item) => typeof item === 'string' && item.trim() !== '');
    return found ? found.trim() : '';
  }
  return String(value).trim();
}

function resolvePublicIp(instance) {
  return (
    firstIp(instance.PublicIpAddress && instance.PublicIpAddress.IpAddress)
    || firstIp(instance.EipAddress && instance.EipAddress.IpAddress)
    || ''
  );
}

function formatMemoryGb(memoryMb) {
  if (!memoryMb) return 0;
  return Math.round((memoryMb / 1024) * 10) / 10;
}

function formatBeijingTime(date = new Date()) {
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

function parseTrafficBytes(data) {
  const details = data && data.TrafficDetails;
  if (!Array.isArray(details)) return null;
  return details.reduce((sum, item) => sum + (Number.parseInt(item && item.Traffic, 10) || 0), 0);
}

function pruneCdtCache() {
  if (cdtCache.size <= CDT_CACHE_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of cdtCache) {
    if (entry.expiresAt <= now) cdtCache.delete(key);
  }
  if (cdtCache.size > CDT_CACHE_MAX_ENTRIES) cdtCache.clear();
}

async function fetchAccountTraffic(accessKeyId, accessKeySecret) {
  const cached = cdtCache.get(accessKeyId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value;
  try {
    const data = await listCdtInternetTraffic({ accessKeyId, accessKeySecret });
    const bytes = parseTrafficBytes(data);
    value = {
      trafficGB: bytes === null ? null : Math.round((bytes / 1024 ** 3) * 1000) / 1000,
      error: bytes === null ? 'CDT 接口未返回流量明细' : null,
    };
    pruneCdtCache();
    cdtCache.set(accessKeyId, { expiresAt: Date.now() + CDT_CACHE_TTL, value });
  } catch (e) {
    // 流量获取失败不影响实例状态展示，且失败结果不缓存
    value = { trafficGB: null, error: e.message || 'CDT 流量获取失败' };
  }

  return value;
}

function describeTraffic(traffic) {
  if (!traffic || traffic.trafficGB === null || traffic.trafficGB === undefined) {
    return { trafficGB: null, trafficText: '获取失败', trafficError: (traffic && traffic.error) || 'CDT 流量获取失败' };
  }
  return {
    trafficGB: traffic.trafficGB,
    trafficText: `${traffic.trafficGB.toFixed(3)} GB`,
    trafficError: traffic.error || null,
  };
}

function summarize(instances) {
  const summary = { total: instances.length, running: 0, stopped: 0, pending: 0, error: 0 };
  for (const item of instances) {
    if (item.error) summary.error += 1;
    else if (item.status === 'Running') summary.running += 1;
    else if (item.status === 'Stopped') summary.stopped += 1;
    else summary.pending += 1;
  }
  return summary;
}

async function loadInstance(config, getAccountTraffic) {
  const base = {
    index: config.index,
    instanceId: config.instanceId,
    regionId: config.regionId,
    name: config.instanceId,
    status: 'Unknown',
    statusLabel: UNKNOWN_STATUS.label,
    statusTone: UNKNOWN_STATUS.tone,
    statusColor: UNKNOWN_STATUS.color,
    specText: '-',
    publicIp: '',
    trafficGB: null,
    trafficText: '未获取',
    trafficError: null,
    error: null,
    canStart: false,
    canStop: false,
  };

  // 先发起流量请求（Promise 内部已兜底，不会抛出未捕获异常）
  const trafficPromise = getAccountTraffic(config);

  try {
    const ecsData = await describeInstance(
      { accessKeyId: config.accessKeyId, accessKeySecret: config.accessKeySecret },
      { instanceId: config.instanceId, regionId: config.regionId },
    );

    const list = ecsData && ecsData.Instances && ecsData.Instances.Instance;
    const instance = Array.isArray(list) ? list[0] : null;
    if (!instance) {
      throw new Error('未找到实例信息，请检查 INSTANCE_ID 与 REGION_ID 是否匹配');
    }

    const status = instance.Status || 'Unknown';
    const meta = getStatusMeta(status);
    const cpu = Number(instance.Cpu) || 0;
    const memoryGb = formatMemoryGb(Number(instance.Memory) || 0);
    const traffic = describeTraffic(await trafficPromise);

    return {
      ...base,
      name: instance.InstanceName || instance.InstanceId || config.instanceId,
      status,
      statusLabel: meta.label,
      statusTone: meta.tone,
      statusColor: meta.color,
      specText: cpu ? `${cpu} 核 / ${memoryGb} GB` : '未知',
      publicIp: resolvePublicIp(instance),
      trafficGB: traffic.trafficGB,
      trafficText: traffic.trafficText,
      trafficError: traffic.trafficError,
      canStart: status === 'Stopped',
      canStop: status === 'Running',
    };
  } catch (e) {
    return {
      ...base,
      error: (e && e.message) || '实例状态获取失败',
      trafficText: '未获取',
    };
  }
}

/**
 * 并发加载全部实例（单实例失败不影响其他实例渲染）
 */
export async function loadAllInstances(configs) {
  const accountTrafficPromises = new Map();
  const getAccountTraffic = (config) => {
    if (!accountTrafficPromises.has(config.accessKeyId)) {
      accountTrafficPromises.set(
        config.accessKeyId,
        fetchAccountTraffic(config.accessKeyId, config.accessKeySecret),
      );
    }
    return accountTrafficPromises.get(config.accessKeyId);
  };

  const instances = await Promise.all(configs.map((config) => loadInstance(config, getAccountTraffic)));
  const now = new Date();

  return {
    updatedAt: now.toISOString(),
    updatedAtText: formatBeijingTime(now),
    summary: summarize(instances),
    instances,
  };
}

/**
 * 执行开机/关机
 */
export async function runInstanceAction(configs, { index, instanceId, action }) {
  const parsedIndex = Number.parseInt(index, 10);
  if (!Number.isInteger(parsedIndex) || parsedIndex < 0 || parsedIndex >= configs.length) {
    throw new ActionError(`无效的实例序号：${index}`);
  }

  const config = configs[parsedIndex];
  if (instanceId && instanceId !== config.instanceId) {
    throw new ActionError('实例校验失败：序号与实例 ID 不匹配');
  }

  const label = ACTION_LABELS[action];
  if (!label) {
    throw new ActionError(`不支持的操作：${action}`);
  }

  const credential = { accessKeyId: config.accessKeyId, accessKeySecret: config.accessKeySecret };
  const target = { instanceId: config.instanceId, regionId: config.regionId };

  if (action === 'start') {
    await startInstance(credential, target);
  } else {
    await stopInstance(credential, target);
  }

  return {
    index: parsedIndex,
    instanceId: config.instanceId,
    action,
    label,
    message: `${label}指令已发送`,
  };
}
