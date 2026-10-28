export type OrgSeed = {
  code: string;
  name: string;
  shortName: string;
  provinceCode: string;
  aliases: string[];
  sortOrder: number;
};

const provinceOrg = (
  code: string,
  name: string,
  shortName: string,
  provinceCode: string,
  aliases: string[],
  sortOrder: number,
): OrgSeed => ({ code, name, shortName, provinceCode, aliases, sortOrder });

export const SHENZHEN_ORG_CODE = "440300";
export const GUANGDONG_ORG_CODE = "440000";

export const ORGANIZATIONS: OrgSeed[] = [
  provinceOrg("110000", "北京市分公司", "北京", "110000", ["北京", "北京市", "北京分公司"], 1),
  provinceOrg("120000", "天津市分公司", "天津", "120000", ["天津", "天津市", "天津分公司"], 2),
  provinceOrg("130000", "河北省分公司", "河北", "130000", ["河北", "河北省", "河北分公司"], 3),
  provinceOrg("140000", "山西省分公司", "山西", "140000", ["山西", "山西省", "山西分公司"], 4),
  provinceOrg("150000", "内蒙古自治区分公司", "内蒙古", "150000", ["内蒙古", "内蒙古自治区", "内蒙古分公司"], 5),
  provinceOrg("210000", "辽宁省分公司", "辽宁", "210000", ["辽宁", "辽宁省", "辽宁分公司"], 6),
  provinceOrg("220000", "吉林省分公司", "吉林", "220000", ["吉林", "吉林省", "吉林分公司"], 7),
  provinceOrg("230000", "黑龙江省分公司", "黑龙江", "230000", ["黑龙江", "黑龙江省", "黑龙江分公司"], 8),
  provinceOrg("310000", "上海市分公司", "上海", "310000", ["上海", "上海市", "上海分公司"], 9),
  provinceOrg("320000", "江苏省分公司", "江苏", "320000", ["江苏", "江苏省", "江苏分公司"], 10),
  provinceOrg("330000", "浙江省分公司", "浙江", "330000", ["浙江", "浙江省", "浙江分公司"], 11),
  provinceOrg("340000", "安徽省分公司", "安徽", "340000", ["安徽", "安徽省", "安徽分公司"], 12),
  provinceOrg("350000", "福建省分公司", "福建", "350000", ["福建", "福建省", "福建分公司"], 13),
  provinceOrg("360000", "江西省分公司", "江西", "360000", ["江西", "江西省", "江西分公司"], 14),
  provinceOrg("370000", "山东省分公司", "山东", "370000", ["山东", "山东省", "山东分公司"], 15),
  provinceOrg("410000", "河南省分公司", "河南", "410000", ["河南", "河南省", "河南分公司"], 16),
  provinceOrg("420000", "湖北省分公司", "湖北", "420000", ["湖北", "湖北省", "湖北分公司"], 17),
  provinceOrg("430000", "湖南省分公司", "湖南", "430000", ["湖南", "湖南省", "湖南分公司"], 18),
  provinceOrg(GUANGDONG_ORG_CODE, "广东省分公司", "广东", "440000", ["广东", "广东省", "广东分公司"], 19),
  provinceOrg("450000", "广西壮族自治区分公司", "广西", "450000", ["广西", "广西壮族自治区", "广西分公司"], 20),
  provinceOrg("460000", "海南省分公司", "海南", "460000", ["海南", "海南省", "海南分公司"], 21),
  provinceOrg("500000", "重庆市分公司", "重庆", "500000", ["重庆", "重庆市", "重庆分公司"], 22),
  provinceOrg("510000", "四川省分公司", "四川", "510000", ["四川", "四川省", "四川分公司"], 23),
  provinceOrg("520000", "贵州省分公司", "贵州", "520000", ["贵州", "贵州省", "贵州分公司"], 24),
  provinceOrg("530000", "云南省分公司", "云南", "530000", ["云南", "云南省", "云南分公司"], 25),
  provinceOrg("540000", "西藏自治区分公司", "西藏", "540000", ["西藏", "西藏自治区", "西藏分公司"], 26),
  provinceOrg("610000", "陕西省分公司", "陕西", "610000", ["陕西", "陕西省", "陕西分公司"], 27),
  provinceOrg("620000", "甘肃省分公司", "甘肃", "620000", ["甘肃", "甘肃省", "甘肃分公司"], 28),
  provinceOrg("630000", "青海省分公司", "青海", "630000", ["青海", "青海省", "青海分公司"], 29),
  provinceOrg("640000", "宁夏回族自治区分公司", "宁夏", "640000", ["宁夏", "宁夏回族自治区", "宁夏分公司"], 30),
  provinceOrg("650000", "新疆维吾尔自治区分公司", "新疆", "650000", ["新疆", "新疆维吾尔自治区", "新疆分公司"], 31),
  provinceOrg(SHENZHEN_ORG_CODE, "深圳市分公司", "深圳", "440300", ["深圳", "深圳市", "深圳分公司"], 32),
];

export const ORG_BY_CODE = new Map(ORGANIZATIONS.map((org) => [org.code, org]));
export const ORG_BY_NAME = new Map(ORGANIZATIONS.map((org) => [org.name, org]));

export function orgSeedByCode(code: string): OrgSeed | undefined {
  return ORG_BY_CODE.get(code);
}
