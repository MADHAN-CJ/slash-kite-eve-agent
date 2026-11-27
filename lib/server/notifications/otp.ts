import { renderEmail } from './render';

export function deviceLabel(agent: string): string {
  const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox'
    : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'Browser';
  const device = /iPhone/.test(agent) ? 'iPhone' : /iPad/.test(agent) ? 'iPad'
    : /Android/.test(agent) ? 'Android' : /Macintosh/.test(agent) ? 'Mac'
    : /Windows/.test(agent) ? 'Windows' : /Linux/.test(agent) ? 'Linux' : '';
  return device ? `${browser} on ${device}` : browser;
}

export function otpEmail(input: { email: string; code: string; returning: boolean; userAgent: string; at: Date }) {
  return renderEmail('otp', {
    email: input.email, code: input.code, returning: input.returning,
    eyebrow: input.returning ? 'Sign-in code' : 'Sign-up code',
    lead: `Enter this code on /markets to ${input.returning ? 'sign in' : 'finish signing up'}.`,
    at: input.at.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) + ' IST',
    device: deviceLabel(input.userAgent), link: {},
  });
}
