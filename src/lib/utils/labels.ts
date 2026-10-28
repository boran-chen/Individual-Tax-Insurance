export const ANOMALY_LABELS: Record<string, string> = {
  INCOME_EMPTY: "应税所得为空",
  INCOME_NON_NUMERIC: "应税所得非数值",
  INCOME_NEGATIVE: "负数排除",
  ENTRY_MONTH_INVALID: "入职月份无法识别",
  ORG_EMPTY: "省份为空",
  ORG_UNMAPPED: "组织无法映射",
  IDENTITY_MISSING: "身份字段缺失",
  DUPLICATE_SUSPECT: "疑似重复",
  FORMULA_NO_RESULT: "公式无计算结果",
};

export function anomalyLabel(code: string): string {
  return ANOMALY_LABELS[code] ?? code;
}

export const VALID_STATUS_LABELS: Record<string, string> = {
  VALID: "已归属",
  ORG_UNMAPPED: "归属异常",
  NEGATIVE: "负数排除",
  INVALID_INCOME: "金额异常",
};

export const DIFF_LABELS: Record<string, string> = {
  MISSING_IN_RETURN: "回传缺少",
  EXTRA_IN_RETURN: "回传多出",
  AMOUNT_MISMATCH: "金额不一致",
  FIELD_MISMATCH: "字段不一致",
  DUPLICATE_KEY: "重复记录",
};

export const TASK_LABELS: Record<string, string> = {
  NOT_SUBMITTED: "未回传",
  PENDING_COMPARE: "待比对",
  COMPARING: "比对中",
  PASSED: "已通过",
  REJECTED: "不通过",
  COMPARE_ERROR: "比对异常",
};

export const JOB_ACTION_LABELS: Record<string, string> = {
  LOGIN: "登录",
  LOGOUT: "退出",
  UPLOAD_BATCH: "上传批次",
  PROCESS_BATCH: "处理批次",
  PUBLISH_BATCH: "发布批次",
  VOID_BATCH: "作废批次",
  DOWNLOAD_EXPORT: "下载申报数据",
  UPLOAD_RETURN: "上传回传",
  COMPARE_RETURN: "比对回传",
  DOWNLOAD_AGGREGATION: "下载归集汇总",
  CREATE_USER: "新增账号",
  UPDATE_USER: "修改账号",
  UPDATE_MAPPING: "修改省份映射",
  UPDATE_CONFIG: "修改系统配置",
};
