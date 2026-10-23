import { describe, expect, it } from 'vitest';
import { isAppleMobile } from './platform';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';

describe('isAppleMobile', () => {
  it('spots iPhone browsers, Safari and others', () => {
    expect(isAppleMobile(IPHONE, 'iPhone', 5)).toBe(true);
    expect(isAppleMobile(CHROME_IOS, 'iPhone', 5)).toBe(true);
  });
  it('spots an iPad that says it is a Mac, but not a real Mac', () => {
    expect(isAppleMobile(IPAD_DESKTOP, 'MacIntel', 5)).toBe(true);
    expect(isAppleMobile(IPAD_DESKTOP, 'MacIntel', 0)).toBe(false);
  });
  it('leaves Android alone', () => {
    expect(isAppleMobile(ANDROID, 'Linux armv8l', 5)).toBe(false);
  });
});
