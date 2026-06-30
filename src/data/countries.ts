// Country dial codes for the international phone input. Curated (Europe-heavy +
// global majors) to keep the bundle small; Poland is the default. `flag` is the
// emoji so we ship no flag images. `dial` has no leading '+'. Kept sorted by
// name except that matching code prefers the longest dial (see PhoneField).
export type Country = { iso2: string; name: string; dial: string; flag: string }

export const COUNTRIES: Country[] = [
  { iso2: 'PL', name: 'Polska', dial: '48', flag: '🇵🇱' },
  { iso2: 'DE', name: 'Niemcy', dial: '49', flag: '🇩🇪' },
  { iso2: 'GB', name: 'Wielka Brytania', dial: '44', flag: '🇬🇧' },
  { iso2: 'UA', name: 'Ukraina', dial: '380', flag: '🇺🇦' },
  { iso2: 'CZ', name: 'Czechy', dial: '420', flag: '🇨🇿' },
  { iso2: 'SK', name: 'Słowacja', dial: '421', flag: '🇸🇰' },
  { iso2: 'LT', name: 'Litwa', dial: '370', flag: '🇱🇹' },
  { iso2: 'LV', name: 'Łotwa', dial: '371', flag: '🇱🇻' },
  { iso2: 'EE', name: 'Estonia', dial: '372', flag: '🇪🇪' },
  { iso2: 'BY', name: 'Białoruś', dial: '375', flag: '🇧🇾' },
  { iso2: 'RU', name: 'Rosja', dial: '7', flag: '🇷🇺' },
  { iso2: 'IE', name: 'Irlandia', dial: '353', flag: '🇮🇪' },
  { iso2: 'FR', name: 'Francja', dial: '33', flag: '🇫🇷' },
  { iso2: 'ES', name: 'Hiszpania', dial: '34', flag: '🇪🇸' },
  { iso2: 'PT', name: 'Portugalia', dial: '351', flag: '🇵🇹' },
  { iso2: 'IT', name: 'Włochy', dial: '39', flag: '🇮🇹' },
  { iso2: 'NL', name: 'Holandia', dial: '31', flag: '🇳🇱' },
  { iso2: 'BE', name: 'Belgia', dial: '32', flag: '🇧🇪' },
  { iso2: 'AT', name: 'Austria', dial: '43', flag: '🇦🇹' },
  { iso2: 'CH', name: 'Szwajcaria', dial: '41', flag: '🇨🇭' },
  { iso2: 'SE', name: 'Szwecja', dial: '46', flag: '🇸🇪' },
  { iso2: 'NO', name: 'Norwegia', dial: '47', flag: '🇳🇴' },
  { iso2: 'DK', name: 'Dania', dial: '45', flag: '🇩🇰' },
  { iso2: 'FI', name: 'Finlandia', dial: '358', flag: '🇫🇮' },
  { iso2: 'IS', name: 'Islandia', dial: '354', flag: '🇮🇸' },
  { iso2: 'HU', name: 'Węgry', dial: '36', flag: '🇭🇺' },
  { iso2: 'RO', name: 'Rumunia', dial: '40', flag: '🇷🇴' },
  { iso2: 'BG', name: 'Bułgaria', dial: '359', flag: '🇧🇬' },
  { iso2: 'GR', name: 'Grecja', dial: '30', flag: '🇬🇷' },
  { iso2: 'HR', name: 'Chorwacja', dial: '385', flag: '🇭🇷' },
  { iso2: 'SI', name: 'Słowenia', dial: '386', flag: '🇸🇮' },
  { iso2: 'RS', name: 'Serbia', dial: '381', flag: '🇷🇸' },
  { iso2: 'MD', name: 'Mołdawia', dial: '373', flag: '🇲🇩' },
  { iso2: 'TR', name: 'Turcja', dial: '90', flag: '🇹🇷' },
  { iso2: 'US', name: 'USA', dial: '1', flag: '🇺🇸' },
  { iso2: 'CA', name: 'Kanada', dial: '1', flag: '🇨🇦' },
  { iso2: 'AU', name: 'Australia', dial: '61', flag: '🇦🇺' },
  { iso2: 'AE', name: 'ZEA', dial: '971', flag: '🇦🇪' },
  { iso2: 'IL', name: 'Izrael', dial: '972', flag: '🇮🇱' },
  { iso2: 'IN', name: 'Indie', dial: '91', flag: '🇮🇳' },
  { iso2: 'CN', name: 'Chiny', dial: '86', flag: '🇨🇳' },
  { iso2: 'JP', name: 'Japonia', dial: '81', flag: '🇯🇵' },
  { iso2: 'BR', name: 'Brazylia', dial: '55', flag: '🇧🇷' },
]

export const DEFAULT_ISO2 = 'PL'

export const countryByIso = (iso2: string): Country =>
  COUNTRIES.find((c) => c.iso2 === iso2) ?? COUNTRIES[0]

// Split a stored E.164 string ("+48600700800") back into a country + national
// number for editing. Prefers the longest matching dial code so e.g. +420 wins
// over +4. Falls back to the default country when nothing matches.
export function splitE164(value: string): { iso2: string; national: string } {
  const v = (value || '').replace(/[^\d+]/g, '')
  if (v.startsWith('+')) {
    const digits = v.slice(1)
    const matches = COUNTRIES.filter((c) => digits.startsWith(c.dial)).sort((a, b) => b.dial.length - a.dial.length)
    if (matches[0]) return { iso2: matches[0].iso2, national: digits.slice(matches[0].dial.length) }
  }
  const digits = v.replace(/\D/g, '')
  return { iso2: DEFAULT_ISO2, national: digits }
}

// True when the number has a plausible national part (6-14 digits) on top of a
// dial code. The API does the authoritative libphonenumber validation; this is
// just to stop obviously-incomplete submissions client-side.
export function isLikelyPhone(value: string): boolean {
  const { iso2, national } = splitE164(value)
  const dial = countryByIso(iso2).dial
  return /^\+\d{7,16}$/.test(value) && national.length >= 6 && (dial + national).length <= 15
}
