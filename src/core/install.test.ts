import { describe, expect, it } from 'vitest';
import { chromeIntent, installContext, installLink, safariLink, wantsInstallGuide } from './install';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0 Mobile/15E148 Safari/604.1',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36',
  androidWebView: 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0 Mobile Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36',
};

describe('install guide', () => {
  it('recognises where the link was opened', () => {
    expect(installContext(UA.iphoneSafari, false, 5)).toBe('ios-safari');
    expect(installContext(UA.iphoneChrome, false, 5)).toBe('ios-other');
    expect(installContext(UA.iphoneInstagram, false, 5)).toBe('ios-other');
    expect(installContext(UA.ipad, false, 5)).toBe('ios-safari');
    expect(installContext(UA.androidChrome, false, 5)).toBe('android');
    expect(installContext(UA.androidWebView, false, 5)).toBe('android-inapp');
    expect(installContext(UA.mac, false, 0)).toBe('desktop');
    expect(installContext(UA.iphoneSafari, true, 5)).toBe('installed');
  });

  it('builds the links', () => {
    expect(wantsInstallGuide('?install')).toBe(true);
    expect(wantsInstallGuide('?dev=1')).toBe(false);
    expect(installLink('https://a.io', '/wa/')).toBe('https://a.io/wa/?install');
    expect(chromeIntent('a.io', '/wa/')).toBe('intent://a.io/wa/?install#Intent;scheme=https;package=com.android.chrome;end');
    expect(safariLink('a.io', '/wa/')).toBe('x-safari-https://a.io/wa/?install');
  });
});
