// 地域パック jp：日本の鉄道の慣習。日本固有の値はこのファイルだけに書く（SPEC §2.6）
// 画面に出す名前はカタログのキーで持ち、プロジェクトのデータになる名前（種別名など）は地図の言語（日本語）で持つ。

/** @typedef {import('../schema.js').RegionPack} RegionPack */

/** @type {RegionPack} */
const jp = {
  id: 'jp',
  nameKey: 'region.jp.name',

  // 新規作成時の Project.locale
  locale: {
    region: 'jp',
    mapLanguage: 'ja',
    subLanguages: ['en'],
    currency: 'JPY',
    distanceUnit: 'km',
  },

  // 英字（names.en）の自動生成（§6.1）
  autoRomanize: true,
  romanizeFrom: 'ja',
  romanizeTo: 'en',
  romajiDefaults: {
    longVowel: 'omit',
    nBeforeBmp: 'm',
    capitalizeAfterHyphen: false,
  },

  // 事業者の区分（§3.1）
  operatorCategories: ['jr', 'major', 'semiMajor', 'minor', 'public', 'thirdSector', 'freight', 'other'],
  operatorCategoryKeyPrefix: 'operatorCategory.',
  operatorDefaults: {
    category: 'major',
    badgeShape: 'roundSquare',
  },

  // 行政区分の呼び方（カタログのキー）
  adminLabelKeys: {
    admin1: 'region.jp.admin1',
    admin2: 'region.jp.admin2',
  },

  // 路線の種類ごとの既定値（§3.2）
  // （集電方式・線路の数・構造は §3.2 にないため、一般的な値を置いた）
  lineKindDefaults: {
    shinkansen:   { gauge: 1435, electrification: 'ac25k60', maxSpeed: 260, accel: 2.6, decel: 2.7, spacingKm: 30, collection: 'overhead', tracks: 2, structure: 'elevated' },
    conventional: { gauge: 1067, electrification: 'dc1500', maxSpeed: 100, accel: 2.5, decel: 3.5, spacingKm: 3.0, collection: 'overhead', tracks: 2, structure: 'ground' },
    subway:       { gauge: 1067, electrification: 'dc1500', maxSpeed: 80, accel: 3.3, decel: 3.5, spacingKm: 1.2, collection: 'overhead', tracks: 2, structure: 'underground' },
    tram:         { gauge: 1067, electrification: 'dc600', maxSpeed: 40, accel: 3.0, decel: 4.0, spacingKm: 0.5, collection: 'overhead', tracks: 2, structure: 'ground' },
    monorail:     { gauge: null, electrification: 'dc1500', maxSpeed: 65, accel: 3.5, decel: 4.0, spacingKm: 1.5, collection: 'overhead', tracks: 2, structure: 'elevated' },
    agt:          { gauge: null, electrification: 'dc750', maxSpeed: 60, accel: 3.5, decel: 4.0, spacingKm: 1.0, collection: 'thirdRail', tracks: 2, structure: 'elevated' },
    cable:        { gauge: 1067, electrification: 'none', maxSpeed: 20, accel: 1.0, decel: 1.0, spacingKm: 1.0, collection: 'overhead', tracks: 1, structure: 'ground' },
    maglev:       { gauge: null, electrification: 'none', maxSpeed: 500, accel: 4.0, decel: 4.0, spacingKm: 60, collection: 'overhead', tracks: 2, structure: 'tunnel' },
    freight:      { gauge: 1067, electrification: 'dc1500', maxSpeed: 95, accel: 1.5, decel: 3.0, spacingKm: 10, collection: 'overhead', tracks: 2, structure: 'ground' },
  },
  defaultLineKind: 'conventional',

  // 駅番号の既定の書式（§3 NumberingRule。prefix が空なら路線記号を使う）
  numberingDefaults: {
    enabled: false,
    prefix: '',
    separator: '',
    start: 1,
    step: 1,
    digits: 2,
    fromEnd: false,
    mode: 'auto',
  },

  // 種別のプリセット（§3.3）。名前は地図の言語（日本語）で、names.en は英語の表記
  serviceTypePresets: [
    {
      id: 'jrConventional',
      labelKey: 'preset.serviceSet.jrConventional',
      types: [
        { name: '普通', shortName: '普', en: 'Local', color: '#6E7780', rank: 1, base: 'all', interchanges: false },
        { name: '快速', shortName: '快', en: 'Rapid', color: '#F08300', rank: 3, base: 'majorAndAbove', interchanges: true },
        { name: '通勤快速', shortName: '通快', en: 'Commuter Rapid', color: '#7A4FBF', rank: 4, base: 'majorAndAbove', interchanges: true },
        { name: '特別快速', shortName: '特快', en: 'Special Rapid', color: '#0E9AA7', rank: 5, base: 'majorAndAbove', interchanges: true },
        { name: '新快速', shortName: '新快', en: 'New Rapid', color: '#1E6FD9', rank: 6, base: 'majorAndAbove', interchanges: true },
        { name: '特急', shortName: '特', en: 'Limited Express', color: '#D7263D', rank: 9, base: 'terminalOnly', interchanges: true, surcharge: true },
      ],
    },
    {
      id: 'private',
      labelKey: 'preset.serviceSet.private',
      types: [
        { name: '各駅停車', shortName: '各停', en: 'Local', color: '#6E7780', rank: 1, base: 'all', interchanges: false },
        { name: '区間準急', shortName: '区準', en: 'Section Semi-Express', color: '#7FBF3F', rank: 2, base: 'manual', interchanges: false },
        { name: '準急', shortName: '準', en: 'Semi-Express', color: '#2E9E4F', rank: 3, base: 'majorAndAbove', interchanges: true },
        { name: '区間急行', shortName: '区急', en: 'Section Express', color: '#F7A600', rank: 4, base: 'manual', interchanges: false },
        { name: '急行', shortName: '急', en: 'Express', color: '#E8541E', rank: 6, base: 'majorAndAbove', interchanges: true },
        { name: '快速急行', shortName: '快急', en: 'Rapid Express', color: '#1E6FD9', rank: 7, base: 'majorAndAbove', interchanges: true },
        { name: '特急', shortName: '特', en: 'Limited Express', color: '#D7263D', rank: 8, base: 'majorAndAbove', interchanges: true },
        { name: '有料特急', shortName: '特', en: 'Reserved Limited Express', color: '#5A2D82', rank: 10, base: 'terminalOnly', interchanges: true, surcharge: true, seating: 'reserved' },
      ],
    },
    {
      id: 'subway',
      labelKey: 'preset.serviceSet.subway',
      types: [
        { name: '各駅停車', shortName: '各停', en: 'Local', color: '#6E7780', rank: 1, base: 'all', interchanges: false },
        { name: '急行', shortName: '急', en: 'Express', color: '#E8541E', rank: 6, base: 'majorAndAbove', interchanges: true },
      ],
    },
    {
      id: 'shinkansen',
      labelKey: 'preset.serviceSet.shinkansen',
      types: [
        { name: '各駅停車型', shortName: '各', en: 'All Stations', color: '#4A7BD0', rank: 1, base: 'all', interchanges: false },
        { name: '速達型', shortName: '速', en: 'Fast', color: '#F0A30A', rank: 5, base: 'majorAndAbove', interchanges: false },
        { name: '最速型', shortName: '最', en: 'Fastest', color: '#D7263D', rank: 9, base: 'terminalOnly', interchanges: false },
      ],
    },
    {
      id: 'tram',
      labelKey: 'preset.serviceSet.tram',
      types: [
        { name: '普通', shortName: '普', en: 'Local', color: '#6E7780', rank: 1, base: 'all', interchanges: false },
      ],
    },
  ],

  // 事業者に合った種別のプリセット（路線の種類が優先。なければ事業者の区分、それもなければ fallback）
  serviceSetDefaults: {
    byLineKind: { shinkansen: 'shinkansen', tram: 'tram', subway: 'subway' },
    byCategory: { jr: 'jrConventional', public: 'subway' },
    fallback: 'private',
  },

  // ラインカラーのパレット（路線図でよく使われる系統の色。名前はカタログの palette.<id>）
  linePalette: [
    { id: 'yellowGreen', hex: '#9ACD32' },
    { id: 'green', hex: '#009944' },
    { id: 'darkGreen', hex: '#00703C' },
    { id: 'teal', hex: '#0E9AA7' },
    { id: 'skyBlue', hex: '#00A7DB' },
    { id: 'blue', hex: '#0079C2' },
    { id: 'navy', hex: '#1E3A8A' },
    { id: 'purple', hex: '#7A4FBF' },
    { id: 'lavender', hex: '#A98BD3' },
    { id: 'pink', hex: '#E85298' },
    { id: 'red', hex: '#D7263D' },
    { id: 'maroon', hex: '#9B1B30' },
    { id: 'vermilion', hex: '#E8541E' },
    { id: 'orange', hex: '#F08300' },
    { id: 'yellow', hex: '#F7C600' },
    { id: 'gold', hex: '#C9A227' },
    { id: 'brown', hex: '#8C6239' },
    { id: 'gray', hex: '#7B8794' },
    { id: 'silver', hex: '#A8B2BD' },
    { id: 'black', hex: '#2B2B2B' },
  ],

  // スタイルプリセット（§5.8。地図記号は地理ビューのフェーズ4で足す）。選ぶと詳細設定をまとめて書き換える
  stylePresets: [
    {
      id: 'urban',
      labelKey: 'stylePreset.urban',
      values: { lineWidth: 6, lineGap: 2, cornerRadius: 8, stationRadius: 5, fontFamily: 'gothic', fontSize: 12, showSubNames: true, showNumbering: true, stationStroke: 'black', background: '#FFFFFF', ink: '#1F2933', paper: '#FFFFFF', colorMode: 'color', stationSymbol: 'circle' },
    },
    {
      id: 'wide',
      labelKey: 'stylePreset.wide',
      values: { lineWidth: 4, lineGap: 1.5, cornerRadius: 6, stationRadius: 4, fontFamily: 'gothic', fontSize: 11, showSubNames: true, showNumbering: false, stationStroke: 'black', background: '#FFFFFF', ink: '#1F2933', paper: '#FFFFFF', colorMode: 'color', stationSymbol: 'tick' },
    },
    {
      id: 'mono',
      labelKey: 'stylePreset.mono',
      values: { lineWidth: 5, lineGap: 2, cornerRadius: 6, stationRadius: 5, fontFamily: 'gothic', fontSize: 12, showSubNames: true, showNumbering: true, stationStroke: 'black', background: '#FFFFFF', ink: '#111111', paper: '#FFFFFF', colorMode: 'mono', stationSymbol: 'circle' },
    },
    {
      id: 'night',
      labelKey: 'stylePreset.night',
      values: { lineWidth: 6, lineGap: 2, cornerRadius: 8, stationRadius: 5, fontFamily: 'gothic', fontSize: 12, showSubNames: true, showNumbering: true, stationStroke: 'line', background: '#1B2530', ink: '#E6EBF0', paper: '#1B2530', colorMode: 'bright', stationSymbol: 'circle' },
    },
  ],

  // 途中駅の停車時間の既定（rank の上限ごと）
  dwellSecByRank: [
    { maxRank: 1, sec: 30 },
    { maxRank: 7, sec: 40 },
    { maxRank: Infinity, sec: 60 },
  ],
};

export default jp;
