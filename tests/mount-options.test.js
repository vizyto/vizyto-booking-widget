import { afterEach, describe, expect, test } from 'bun:test'
import { resolveWidgetChannel } from '../src/channel.ts'
import { ENTRY_POINTS, resolveEntryPoint, resolveLoginHref, socialLogin } from '../src/mountOptions.ts'
import { createAppointment, createRental, joinWaitlist, registerForSession } from '../src/api.ts'
import { SocialLoginOptions } from '../src/steps/StepLogin.tsx'

describe('channel mount option', () => {
  test("only 'website' leaves the external-site channel", () => {
    expect(resolveWidgetChannel('website')).toBe('website')
    expect(resolveWidgetChannel('widget')).toBe('widget')
    for (const v of [undefined, null, '', 'client_app', 'WEBSITE', 'web', 1, {}]) expect(resolveWidgetChannel(v)).toBe('widget')
  })
})

describe('entryPoint mount option', () => {
  test('keeps exactly the known place codes', () => {
    expect([...ENTRY_POINTS]).toEqual(['instagram', 'facebook', 'whatsapp', 'google', 'qr', 'www', 'link'])
    for (const v of ENTRY_POINTS) expect(resolveEntryPoint(v)).toBe(v)
  })

  test('drops anything else', () => {
    for (const v of [undefined, null, '', 'tiktok', 'Instagram', ' qr', 'qr ', 'constructor', 7, ['qr']]) {
      expect(resolveEntryPoint(v)).toBeUndefined()
    }
  })
})

describe('loginHref mount option', () => {
  test('keeps an absolute http(s) URL only', () => {
    expect(resolveLoginHref('https://vizyto.com/logowanie?next=%2Fr%2F24-zlota-brzytwa')).toBe('https://vizyto.com/logowanie?next=%2Fr%2F24-zlota-brzytwa')
    expect(resolveLoginHref('http://localhost:3000/logowanie')).toBe('http://localhost:3000/logowanie')
    for (const v of [undefined, '', '/logowanie', 'javascript:alert(1)', 'data:text/html,x', 'mailto:a@b.pl', 42]) {
      expect(resolveLoginHref(v)).toBeUndefined()
    }
  })
})

// The appointment POST is the only write that carries `entryPoint`.
describe('entryPoint in the request body', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  /** Runs `write` against a stubbed fetch and returns the JSON bodies it posted. */
  async function bodiesOf(write) {
    const bodies = []
    globalThis.fetch = async (_url, init) => {
      bodies.push(JSON.parse(init.body))
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }
    await write()
    return bodies
  }

  const cfg = (extra) => ({ apiBase: 'https://api.example.test', siteKey: '', businessId: 24, channel: 'website', ...extra })
  const visit = (c) => createAppointment(c, { items: [], startDate: '2030-01-07T08:00:00.000Z', bookedById: 1, idempotencyKey: 'k' }, 't')

  test('a valid place code goes with a visit', async () => {
    const [body] = await bodiesOf(() => visit(cfg({ entryPoint: 'instagram' })))
    expect(body.entryPoint).toBe('instagram')
  })

  test('no place code, no key in the body', async () => {
    const [body] = await bodiesOf(() => visit(cfg({})))
    expect('entryPoint' in body).toBe(false)
    // mount() drops an unknown code before it reaches cfg.
    const [dropped] = await bodiesOf(() => visit(cfg({ entryPoint: resolveEntryPoint('tiktok') })))
    expect('entryPoint' in dropped).toBe(false)
  })

  test('classes, rentals and the waitlist never carry it', async () => {
    const c = cfg({ entryPoint: 'qr' })
    const bodies = await bodiesOf(() => Promise.all([
      registerForSession(c, { sessionId: 901, bookedById: 1, idempotencyKey: 'k' }, 't'),
      createRental(c, { resourceId: 31, startDate: '2030-01-07T08:00:00.000Z', endDate: '2030-01-08T08:00:00.000Z', bookedById: 1, idempotencyKey: 'k' }, 't'),
      joinWaitlist(c, { businessServiceId: 1, dateFrom: '2030-01-07', dateTo: '2030-01-08', bookedById: 1 }, 't'),
    ]))
    expect(bodies.length).toBe(3)
    for (const body of bodies) expect('entryPoint' in body).toBe(false)
  })
})

describe('login step without a site key', () => {
  /** Every host-element vnode (`button`, `a`, `div`...) of a rendered tree, depth first. */
  function elements(node, out = []) {
    if (node == null || typeof node !== 'object') return out
    if (Array.isArray(node)) {
      for (const n of node) elements(n, out)
      return out
    }
    if (typeof node.type === 'string') out.push(node)
    elements(node.props?.children, out)
    return out
  }
  const text = (node) => {
    const c = node?.props?.children
    if (c == null) return ''
    if (typeof c === 'string' || typeof c === 'number') return String(c)
    return (Array.isArray(c) ? c : [c]).map((x) => (typeof x === 'string' ? x : '')).join('')
  }
  const render = (social) => SocialLoginOptions({ social, onOAuth: () => {}, oauthBusy: null, busy: false })

  test('a site key keeps the three OAuth buttons', () => {
    expect(socialLogin('pk_live_x', 'https://vizyto.com/logowanie')).toEqual({ kind: 'buttons' })
    const els = elements(render(socialLogin('pk_live_x', undefined)))
    expect(els.filter((e) => e.type === 'button').length).toBe(3)
    expect(els.some((e) => e.type === 'a')).toBe(false)
  })

  test('no key and a loginHref: one link to the host sign-in, no OAuth buttons', () => {
    const social = socialLogin('', 'https://vizyto.com/logowanie?next=%2Fr%2F24')
    expect(social).toEqual({ kind: 'link', href: 'https://vizyto.com/logowanie?next=%2Fr%2F24' })
    const els = elements(render(social))
    expect(els.some((e) => e.type === 'button')).toBe(false)
    const links = els.filter((e) => e.type === 'a')
    expect(links.length).toBe(1)
    expect(links[0].props.href).toBe('https://vizyto.com/logowanie?next=%2Fr%2F24')
    expect(links[0].props.target).toBe('_top')
    expect(links[0].props.class).toBe('vz-oauth')
    expect(text(links[0]).trim()).toBe('Zaloguj się przez Google, Apple lub Facebook')
  })

  test('no key and no usable loginHref: nothing above the e-mail form', () => {
    expect(socialLogin('', undefined)).toEqual({ kind: 'none' })
    expect(socialLogin('', 'javascript:alert(1)')).toEqual({ kind: 'none' })
    expect(render(socialLogin('', undefined))).toBeNull()
  })
})
