import type { BrowserContext } from '@playwright/test';
import log from '@test/util/logger.js';

// LOGIN_COOKIES_TEXTにはcookies.txt形式の本文をそのまま指定する。
const loginCookiesTextEnvName = 'LOGIN_COOKIES_TEXT';
const httpOnlyDomainPrefix = '#HttpOnly_';

type LoginCookie = Parameters<BrowserContext['addCookies']>[0][number];
type LoginCookies = LoginCookie[];

const parseBooleanFlag = (value: string, fieldName: string, lineNumber: number): boolean => {
  if (value === 'TRUE') {
    return true;
  }
  if (value === 'FALSE') {
    return false;
  }
  throw new TypeError(`cookies.txtの${lineNumber}行目の${fieldName}にはTRUEまたはFALSEを指定してください`);
};

const splitCookieLine = (line: string): string[] =>
  line.includes('\t') ? line.split('\t') : line.trim().split(/\s+/);

const parseExpires = (value: string, lineNumber: number): number | undefined => {
  const expires = Number(value);
  if (!Number.isFinite(expires)) {
    throw new TypeError(`cookies.txtの${lineNumber}行目の有効期限が数値ではありません`);
  }
  return expires > 0 ? expires : undefined;
};

const normalizeCookieDomain = (rawDomain: string, includeSubdomains: boolean): string => {
  const domain = rawDomain.startsWith(httpOnlyDomainPrefix)
    ? rawDomain.slice(httpOnlyDomainPrefix.length)
    : rawDomain;
  const hostOnlyDomain = domain.replace(/^\.+/, '');
  return includeSubdomains ? `.${hostOnlyDomain}` : hostOnlyDomain;
};

const parseCookieLine = (line: string, lineNumber: number): LoginCookie | undefined => {
  const trimmedLine = line.trim();
  if (!trimmedLine || (trimmedLine.startsWith('#') && !trimmedLine.startsWith(httpOnlyDomainPrefix))) {
    return undefined;
  }

  const fields = splitCookieLine(trimmedLine);
  if (fields.length < 7) {
    throw new TypeError(`cookies.txtの${lineNumber}行目の形式が不正です`);
  }

  const [rawDomain, includeSubdomainsFlag, path, secureFlag, expiresText, name, ...valueParts] = fields;
  const httpOnly = rawDomain.startsWith(httpOnlyDomainPrefix);
  const includeSubdomains = parseBooleanFlag(includeSubdomainsFlag, 'include_subdomains', lineNumber);
  const domain = normalizeCookieDomain(rawDomain, includeSubdomains);
  const value = valueParts.join(line.includes('\t') ? '\t' : ' ');

  if (!domain || !path || !name) {
    throw new TypeError(`cookies.txtの${lineNumber}行目にdomain/path/nameのいずれかがありません`);
  }

  const cookie: LoginCookie = {
    name,
    value,
    domain,
    path,
    secure: parseBooleanFlag(secureFlag, 'secure', lineNumber),
    httpOnly,
  };
  const expires = parseExpires(expiresText, lineNumber);
  if (expires !== undefined) {
    cookie.expires = expires;
  }
  return cookie;
};

export const parseCookiesTxt = (cookiesText: string): LoginCookies => {
  const cookies = cookiesText
    .split(/\r?\n/)
    .map((line, index) => parseCookieLine(line, index + 1))
    .filter((cookie): cookie is LoginCookie => cookie !== undefined);

  if (cookies.length === 0) {
    throw new Error('cookies.txtにCookieが含まれていません');
  }
  return cookies;
};

const loadLoginCookies = async (): Promise<LoginCookies> => {
  const loginCookiesText: string | undefined = process.env[loginCookiesTextEnvName];
  if (loginCookiesText) {
    return parseCookiesTxt(loginCookiesText);
  }

  throw new Error(
    `ログインCookieを設定する場合は${loginCookiesTextEnvName}でcookies.txt形式のCookieを指定してください`,
  );
};

export const applyLoginCookiesFromEnv = async (
  context: BrowserContext,
  shouldApply: boolean,
): Promise<void> => {
  if (!shouldApply) {
    return;
  }

  const cookies: LoginCookies = await loadLoginCookies();
  await context.addCookies(cookies);
  log.info(`ログインCookieを${cookies.length}件設定しました。`);
};
