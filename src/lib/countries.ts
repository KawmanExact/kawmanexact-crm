/**
 * Country reference table + resolver for free-text `Deal.country`.
 *
 * `Deal.country` is a free-text column (placeholder "India"), so the same
 * country can be entered many ways: "India", "india", "IN", "Bharat", "Hindustan".
 * This module normalises those into one resolved country with a centroid so the
 * dashboard can group deals and place them on a map without ever guessing a
 * location for unknown input.
 *
 * Matching rules:
 *  - Names and aliases are matched AFTER case / punctuation / diacritic folding
 *    (e.g. "Türkiye" ≡ "turkiye" ≡ "Turkiye", "U.S.A" ≡ "usa").
 *  - ISO 3166-1 alpha-2 codes (e.g. "IN", "US", "NO", "IT") match ONLY when
 *    typed in UPPER CASE, so lowercase "no" and "it" are NOT Norway or Italy.
 *  - Whole-string matching only: "Indiaabc" or "Ind" do not resolve.
 *  - Blank / null / unrecognised input returns null (never guessed).
 *
 * The table is a representative set of ~110 countries / territories with the
 * most commonly traded partners covered; every entry carries a centroid.
 */

export interface CountryInfo {
  name: string
  iso2: string
  lat: number
  lng: number
  aliases: string[]
}

type ResolvedCountry = CountryInfo

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

const COUNTRIES: CountryInfo[] = [
  { name: 'Argentina', iso2: 'AR', lat: -38.4161, lng: -63.6167, aliases: [] },
  { name: 'Australia', iso2: 'AU', lat: -25.0793, lng: 133.7752, aliases: ['Aus'] },
  { name: 'Austria', iso2: 'AT', lat: 47.5162, lng: 11.4078, aliases: [] },
  { name: 'Bangladesh', iso2: 'BD', lat: 23.685, lng: 90.3563, aliases: [] },
  { name: 'Belgium', iso2: 'BE', lat: 50.8027, lng: 4.4697, aliases: [] },
  { name: 'Brazil', iso2: 'BR', lat: -14.235, lng: -57.9126, aliases: ['Brasil'] },
  { name: 'Bulgaria', iso2: 'BG', lat: 42.7337, lng: 25.4816, aliases: [] },
  { name: 'Canada', iso2: 'CA', lat: 56.1304, lng: -106.3468, aliases: [] },
  { name: 'Chile', iso2: 'CL', lat: -33.9, lng: -71.3667, aliases: [] },
  { name: 'China', iso2: 'CN', lat: 35.8614, lng: 104.1954, aliases: ["People's Republic of China", 'PRC'] },
  { name: 'Colombia', iso2: 'CO', lat: 4.4062, lng: -74.2974, aliases: [] },
  { name: 'Congo (Congo-Brazzaville)', iso2: 'CG', lat: -4.4419, lng: 15.27, aliases: ['Congo', 'Republic of the Congo', 'Brazzaville'] },
  { name: 'Croatia', iso2: 'HR', lat: 45.1233, lng: 15.245, aliases: ['Hrvatska'] },
  { name: 'Czechia', iso2: 'CZ', lat: 49.8175, lng: 15.4732, aliases: ['Czech Republic', 'Czech'] },
  { name: 'Democratic Republic of the Congo', iso2: 'CD', lat: -2.9272, lng: 23.6852, aliases: ['DRC', 'Democratic Republic of Congo', 'DR Congo', 'Congo-Kinshasa', 'Zaire'] },
  { name: 'Denmark', iso2: 'DK', lat: 55.6761, lng: 11.5096, aliases: ['Danmark'] },
  { name: 'Ecuador', iso2: 'EC', lat: -1.75, lng: -77.5, aliases: [] },
  { name: 'Egypt', iso2: 'EG', lat: 26.8206, lng: 30.8025, aliases: ['Misr'] },
  { name: 'Estonia', iso2: 'EE', lat: 58.72, lng: 25.1, aliases: ['Eesti'] },
  { name: 'Finland', iso2: 'FI', lat: 64.0, lng: 26.0, aliases: ['Suomi'] },
  { name: 'France', iso2: 'FR', lat: 46.6034, lng: 2.5951, aliases: ['République française'] },
  { name: 'Georgia', iso2: 'GE', lat: 42.0, lng: 43.0, aliases: [] },
  { name: 'Germany', iso2: 'DE', lat: 51.1657, lng: 10.4515, aliases: ['Deutschland'] },
  { name: 'Ghana', iso2: 'GH', lat: 7.9465, lng: -1.0232, aliases: [] },
  { name: 'Greece', iso2: 'GR', lat: 39.074, lng: 21.8243, aliases: ['Elláda', 'Ellas', 'Hellenic Republic'] },
  { name: 'Hungary', iso2: 'HU', lat: 47.1625, lng: 19.5019, aliases: ['Magyarország', 'Magyar'] },
  { name: 'India', iso2: 'IN', lat: 20.5937, lng: 78.9629, aliases: ['Bharat', 'Hindustan'] },
  { name: 'Indonesia', iso2: 'ID', lat: -0.7889, lng: 113.9213, aliases: [] },
  { name: 'Iran', iso2: 'IR', lat: 32.4279, lng: 53.6881, aliases: ['Persia', 'Islamic Republic of Iran'] },
  { name: 'Iraq', iso2: 'IQ', lat: 33.2232, lng: 43.7, aliases: [] },
  { name: 'Ireland', iso2: 'IE', lat: 53.1428, lng: -7.6104, aliases: ['Éire', 'Republic of Ireland'] },
  { name: 'Israel', iso2: 'IL', lat: 31.0461, lng: 34.7694, aliases: [] },
  { name: 'Italy', iso2: 'IT', lat: 41.8719, lng: 12.5675, aliases: ['Italia', 'Italian Republic'] },
  { name: 'Côte d\'Ivoire', iso2: 'CI', lat: 7.54, lng: -5.52, aliases: ['Cote d\'Ivoire', 'Ivory Coast'] },
  { name: 'Jamaica', iso2: 'JM', lat: 18.1, lng: -77.25, aliases: [] },
  { name: 'Japan', iso2: 'JP', lat: 36.2048, lng: 138.2529, aliases: ['Nippon', 'Nihon'] },
  { name: 'Jordan', iso2: 'JO', lat: 31.2656, lng: 36.2008, aliases: [] },
  { name: 'Kazakhstan', iso2: 'KZ', lat: 48.0159, lng: 66.9237, aliases: [] },
  { name: 'Kenya', iso2: 'KE', lat: 1.0931, lng: 37.9062, aliases: [] },
  { name: 'Kuwait', iso2: 'KW', lat: 29.311, lng: 47.85, aliases: [] },
  { name: 'Kyrgyzstan', iso2: 'KG', lat: 41.2044, lng: 74.767, aliases: [] },
  { name: 'Laos', iso2: 'LA', lat: 19.22, lng: 102.5, aliases: ['Lao PDR', 'Lao People\'s Democratic Republic'] },
  { name: 'Latvia', iso2: 'LV', lat: 56.7, lng: 24.6, aliases: ['Latvija', 'Lettonie'] },
  { name: 'Lebanon', iso2: 'LB', lat: 33.8547, lng: 35.8036, aliases: [] },
  { name: 'Liberia', iso2: 'LR', lat: 6.4281, lng: -9.4294, aliases: [] },
  { name: 'Libya', iso2: 'LY', lat: 26.3375, lng: 16.8712, aliases: [] },
  { name: 'Lithuania', iso2: 'LT', lat: 55.3, lng: 24.96, aliases: ['Lietuva', 'Litauen'] },
  { name: 'Luxembourg', iso2: 'LU', lat: 49.8153, lng: 6.1294, aliases: [] },
  { name: 'Malaysia', iso2: 'MY', lat: 4.2105, lng: 101.9778, aliases: [] },
  { name: 'Mali', iso2: 'ML', lat: 17.13, lng: -3.93, aliases: [] },
  { name: 'Mexico', iso2: 'MX', lat: 23.6345, lng: -102.5528, aliases: ['México', 'Estados Unidos Mexicanos'] },
  { name: 'Moldova', iso2: 'MD', lat: 47.4112, lng: 28.3698, aliases: ['Republic of Moldova', 'Moldavia'] },
  { name: 'Mongolia', iso2: 'MN', lat: 46.8625, lng: 103.8625, aliases: [] },
  { name: 'Morocco', iso2: 'MA', lat: 31.7997, lng: -7.0914, aliases: ['Maroc', 'Al-Maghrib'] },
  { name: 'Mozambique', iso2: 'MZ', lat: -25.0317, lng: 32.8529, aliases: ['Moçambique'] },
  { name: 'Myanmar', iso2: 'MM', lat: 21.9138, lng: 95.9562, aliases: ['Burma'] },
  { name: 'Namibia', iso2: 'NA', lat: -22.9575, lng: 17.0802, aliases: [] },
  { name: 'Nepal', iso2: 'NP', lat: 28.3949, lng: 84.124, aliases: [] },
  { name: 'Netherlands', iso2: 'NL', lat: 52.1326, lng: 5.2913, aliases: ['The Netherlands', 'Holland'] },
  { name: 'New Zealand', iso2: 'NZ', lat: -40.8636, lng: 174.84, aliases: ['Aotearoa'] },
  { name: 'Nicaragua', iso2: 'NI', lat: 12.8654, lng: -85.2072, aliases: [] },
  { name: 'Niger', iso2: 'NE', lat: 16.972, lng: 8.0811, aliases: [] },
  { name: 'Nigeria', iso2: 'NG', lat: 9.082, lng: 8.6455, aliases: [] },
  { name: 'North Korea', iso2: 'KP', lat: 40.5558, lng: 127.9912, aliases: ['Korea North', 'DPRK', 'Democratic People\'s Republic of Korea'] },
  { name: 'North Macedonia', iso2: 'MK', lat: 41.6084, lng: 22.1661, aliases: ['Macedonia', 'Macedonia (North)'] },
  { name: 'Norway', iso2: 'NO', lat: 60.4914, lng: 8.4689, aliases: ['Norge', 'Noreg'] },
  { name: 'Oman', iso2: 'OM', lat: 21.5667, lng: 57.0777, aliases: [] },
  { name: 'Pakistan', iso2: 'PK', lat: 30.3762, lng: 69.3451, aliases: [] },
  { name: 'Panama', iso2: 'PA', lat: 8.7833, lng: -79.5167, aliases: [] },
  { name: 'Paraguay', iso2: 'PY', lat: -22.9026, lng: -58.5272, aliases: [] },
  { name: 'Peru', iso2: 'PE', lat: -9.19, lng: -75.0157, aliases: ['Perú'] },
  { name: 'Philippines', iso2: 'PH', lat: 12.8657, lng: 121.7583, aliases: ['Pilipinas'] },
  { name: 'Poland', iso2: 'PL', lat: 51.9194, lng: 19.145, aliases: ['Polska', 'Polen'] },
  { name: 'Portugal', iso2: 'PT', lat: 39.3999, lng: -8.2153, aliases: ['Português'] },
  { name: 'Qatar', iso2: 'QA', lat: 25.2657, lng: 51.1835, aliases: [] },
  { name: 'Romania', iso2: 'RO', lat: 45.9432, lng: 25.4361, aliases: ['Rumania', 'Roumania', 'România'] },
  { name: 'Russia', iso2: 'RU', lat: 61.524, lng: 105.3188, aliases: ['Russian Federation', 'Rossiya'] },
  { name: 'Rwanda', iso2: 'RW', lat: -1.9706, lng: 30.2844, aliases: [] },
  { name: 'Saudi Arabia', iso2: 'SA', lat: 23.8858, lng: 45.0819, aliases: ['Saudi', 'Kingdom of Saudi Arabia'] },
  { name: 'Senegal', iso2: 'SN', lat: 14.4974, lng: -15.4815, aliases: [] },
  { name: 'Serbia', iso2: 'RS', lat: 44.0165, lng: 20.9114, aliases: [] },
  { name: 'Singapore', iso2: 'SG', lat: 1.3521, lng: 103.8198, aliases: ['Singapura'] },
  { name: 'Slovakia', iso2: 'SK', lat: 48.6694, lng: 19.6982, aliases: ['Slovak Republic', 'Slovensko'] },
  { name: 'Slovenia', iso2: 'SI', lat: 46.1558, lng: 14.9903, aliases: ['Slovenija'] },
  { name: 'South Africa', iso2: 'ZA', lat: -30.5595, lng: 22.9375, aliases: ['RSA', 'Suid-Afrika', 'Azania'] },
  { name: 'South Korea', iso2: 'KR', lat: 35.904, lng: 127.717, aliases: ['Korea', 'Republic of Korea', 'Korea (South)'] },
  { name: 'Spain', iso2: 'ES', lat: 40.4637, lng: -3.7008, aliases: ['España', 'Espagne', 'Iberia'] },
  { name: 'Sri Lanka', iso2: 'LK', lat: 7.873, lng: 80.771, aliases: ['Ceylon', 'Lanka'] },
  { name: 'Sweden', iso2: 'SE', lat: 62.1058, lng: 15.5508, aliases: ['Sverige'] },
  { name: 'Switzerland', iso2: 'CH', lat: 46.8182, lng: 8.2275, aliases: ['Schweiz', 'Suisse', 'Svizzera'] },
  { name: 'Syria', iso2: 'SY', lat: 34.8021, lng: 38.9968, aliases: ['Syrian Arab Republic'] },
  { name: 'Taiwan', iso2: 'TW', lat: 23.6109, lng: 120.9147, aliases: ['Chinese Taipei', 'Taipei'] },
  { name: 'Thailand', iso2: 'TH', lat: 15.1, lng: 100.95, aliases: ['Thai Land', 'Prathet Thai'] },
  { name: 'Timor-Leste', iso2: 'TL', lat: -8.875, lng: 125.72, aliases: ['East Timor'] },
  { name: 'Togo', iso2: 'TG', lat: 8.6167, lng: 1.0667, aliases: [] },
  { name: 'Trinidad and Tobago', iso2: 'TT', lat: 10.6921, lng: -61.2245, aliases: ['Trinidad', 'Trinidad & Tobago'] },
  { name: 'Tunisia', iso2: 'TN', lat: 33.841, lng: 9.4201, aliases: ['Tunisie'] },
  { name: 'Türkiye', iso2: 'TR', lat: 38.9647, lng: 35.2403, aliases: ['Turkey', 'Turkiye', 'Anatolia'] },
  { name: 'Turkmenistan', iso2: 'TM', lat: 38.9637, lng: 59.1, aliases: [] },
  { name: 'Uganda', iso2: 'UG', lat: 1.3733, lng: 32.2903, aliases: [] },
  { name: 'Ukraine', iso2: 'UA', lat: 48.3794, lng: 31.1699, aliases: ['Ucrania'] },
  { name: 'United Arab Emirates', iso2: 'AE', lat: 23.4162, lng: 53.8058, aliases: ['UAE', 'Emirates'] },
  { name: 'United Kingdom', iso2: 'GB', lat: 55.3781, lng: -3.436, aliases: ['UK', 'Britain', 'Great Britain', 'England', 'Scotland', 'Wales'] },
  { name: 'United States', iso2: 'US', lat: 37.0902, lng: -95.7129, aliases: ['USA', 'America', 'United States of America'] },
  { name: 'Uruguay', iso2: 'UY', lat: -32.5228, lng: -55.7658, aliases: [] },
  { name: 'Venezuela', iso2: 'VE', lat: 8.7833, lng: -75.667, aliases: ['Bolivarian Republic of Venezuela'] },
  { name: 'Vietnam', iso2: 'VN', lat: 14.0583, lng: 108.2772, aliases: ['Viet Nam', 'Việt Nam', 'Saigon'] },
  { name: 'Yemen', iso2: 'YE', lat: 15.5527, lng: 48.0079, aliases: [] },
  { name: 'Zambia', iso2: 'ZM', lat: -14.894, lng: 28.97, aliases: ['Northern Rhodesia'] },
  { name: 'Zimbabwe', iso2: 'ZW', lat: -19.0157, lng: 29.1541, aliases: ['Rhodesia'] },
]

const FOLDED = new Map<string, ResolvedCountry>()
const ISO2 = new Map<string, ResolvedCountry>()

for (const c of COUNTRIES) {
  const resolved: ResolvedCountry = c
  const foldedName = fold(c.name)
  if (foldedName) FOLDED.set(foldedName, resolved)
  for (const alias of c.aliases) {
    const f = fold(alias)
    if (f) FOLDED.set(f, resolved)
  }
  ISO2.set(c.iso2, resolved)
}

/** Resolve a free-text country entry to a known country, or null. */
export function resolveCountry(raw: string | null | undefined): ResolvedCountry | null {
  if (raw == null) return null
  const trimmed = String(raw).trim()
  if (trimmed === '') return null

  const folded = fold(trimmed)
  if (folded !== '') {
    const matched = FOLDED.get(folded)
    if (matched) return matched
  }

  // ISO 3166-1 alpha-2 — only EXACT UPPER CASE matches, so "no" and "it"
  // are never confused with Norway / Italy.
  if (/^[A-Z]{2}$/.test(trimmed)) {
    const matched = ISO2.get(trimmed)
    if (matched) return matched
  }

  return null
}

/** Expose the full table so callers can introspect / render options. */
export function listCountries(): CountryInfo[] {
  return COUNTRIES
}
