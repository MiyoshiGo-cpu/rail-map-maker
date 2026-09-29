// データモデル（SPEC §3）：型（JSDoc）・列挙値・既定値
// フェーズ1で使わない項目も、構造だけは最初から持つ。

export const SCHEMA_VERSION = 1;

// ---------- 列挙値（§3.1） ----------

export const LINE_KINDS = /** @type {const} */ (['shinkansen', 'conventional', 'subway', 'tram', 'monorail', 'agt', 'cable', 'maglev', 'freight']);
export const ELECTRIFICATIONS = /** @type {const} */ (['none', 'dc600', 'dc750', 'dc1500', 'dc3000', 'ac15k16', 'ac20k50', 'ac20k60', 'ac25k50', 'ac25k60']);
export const COLLECTIONS = /** @type {const} */ (['overhead', 'thirdRail']);
export const TRACKS = /** @type {const} */ ([1, 2, 3, 4, 6]);
export const STRUCTURES = /** @type {const} */ (['ground', 'elevated', 'underground', 'cutting', 'tunnel', 'bridge']);
export const STATION_STRUCTURES = /** @type {const} */ (['ground', 'elevated', 'underground', 'semiUnderground']);
export const LINE_STATUSES = /** @type {const} */ (['open', 'construction', 'planned', 'suspended', 'abolished']);
export const STATION_RANKS = /** @type {const} */ (['terminal', 'major', 'normal', 'unstaffed', 'temporary', 'signal', 'freight', 'depot']);
export const GAUGE_CANDIDATES = [1067, 1435, 1372, 762, 1000, 1520, 1600, 1668];
export const BADGE_SHAPES = /** @type {const} */ (['square', 'roundSquare', 'circle', 'pill', 'none']);
export const UP_DIRECTIONS = /** @type {const} */ (['toStart', 'toEnd']);
export const LABEL_POSITIONS = /** @type {const} */ (['auto', 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
export const LABEL_ORIENTATIONS = /** @type {const} */ (['horizontal', 'vertical', 'rot45', 'rotMinus45']);
export const BENDS = /** @type {const} */ (['auto', 'diagonalFirst', 'straightFirst']);
export const PLATFORM_TYPES = /** @type {const} */ (['island', 'side', 'bay', 'mixed']);
export const FACILITIES = /** @type {const} */ (['airport', 'port', 'busTerminal']);

/** ID の接頭辞 */
export const ID_PREFIX = {
  project: 'pj',
  operator: 'op',
  line: 'ln',
  station: 'st',
  interchange: 'ic',
  serviceType: 'ty',
  service: 'sv',
  rollingStock: 'rs',
  fareTable: 'ft',
  city: 'ct',
  region: 'rg',
  restorePoint: 'rp',
};

/** 乗換の徒歩時間の既定（分） */
export const DEFAULT_WALK_MINUTES = 5;

// ---------- 型 ----------

/** @typedef {{ [lang: string]: string }} Names 言語コード → 表記 */
/** @typedef {{ x: number, y: number }} SchematicPos 路線図の格子座標（整数） */
/** @typedef {{ x: number, y: number } | { lat: number, lon: number }} GeoPos 架空は km、実在は WGS84 */
/** @typedef {typeof LINE_KINDS[number]} LineKind */
/** @typedef {typeof ELECTRIFICATIONS[number]} Electrification */
/** @typedef {typeof STRUCTURES[number]} Structure */
/** @typedef {typeof LINE_STATUSES[number]} LineStatus */
/** @typedef {typeof STATION_RANKS[number]} StationRank */

/**
 * @typedef {object} ProjectLocale
 * @property {string} region 地域パック（フェーズ8までは 'jp'）
 * @property {string} mapLanguage 地図の主表記の言語（BCP 47）
 * @property {string[]} subLanguages 副表記に出す言語
 * @property {string} currency ISO 4217
 * @property {'km'|'mi'} distanceUnit 表示の単位（内部は常に km）
 */

/**
 * @typedef {object} TileSource
 * @property {'none'|'gsi'|'osm'|'custom'} provider
 * @property {string} [layer]
 * @property {string} [urlTemplate]
 * @property {string} [attribution]
 */

/**
 * 地形生成のパラメータ（フェーズ4）
 * @typedef {object} TerrainParams
 * @property {'island'|'archipelago'|'coast'|'inland'} shape
 * @property {256|512|1024} size
 * @property {number} cellKm 1マスの大きさ（km）
 * @property {number} landRatio 陸地の割合（0〜1）
 * @property {number} ruggedness 山の険しさ（0〜1）
 * @property {number} coastComplexity 海岸線の複雑さ（0〜1）
 * @property {number} riverAmount 川の多さ（0〜1）
 * @property {number} cityCount
 * @property {number} totalPopulation
 */

/**
 * 地形データ（フェーズ4）
 * @typedef {object} TerrainData
 * @property {number} width
 * @property {number} height
 * @property {string} elevation Int16 の標高（m）を base64 にしたもの
 * @property {Array<object>} edits ブラシ編集の差分
 */

/**
 * @typedef {{ mode: 'none' }
 *   | { mode: 'fictional', seed: string, gen: TerrainParams, terrain: TerrainData, cities: City[], regions: Region[] }
 *   | { mode: 'real', area: 'jp'|'world', background: TileSource }} World
 */

/**
 * @typedef {object} Operator
 * @property {string} id
 * @property {string} name
 * @property {string} shortName
 * @property {Names} names
 * @property {string} category 事業者の区分（地域パックが定める）
 * @property {string} color コーポレートカラー
 * @property {string} textColor
 * @property {'square'|'roundSquare'|'circle'|'pill'|'none'} badgeShape
 * @property {string} [note]
 */

/**
 * @typedef {object} SectionAttrs
 * @property {number|null} gauge null は対象外（モノレール等）
 * @property {Electrification} electrification
 * @property {'overhead'|'thirdRail'} collection
 * @property {1|2|3|4|6} tracks
 * @property {number} maxSpeed km/h
 * @property {Structure} structure
 * @property {LineStatus} status
 * @property {number} [openedYear]
 * @property {number} [closedYear]
 */

/**
 * 駅間ごとの上書き。キーが無い・null のときは路線の既定値を使う
 * @typedef {object} SectionOverride
 * @property {number|null} [gauge]
 * @property {Electrification|null} [electrification]
 * @property {'overhead'|'thirdRail'|null} [collection]
 * @property {1|2|3|4|6|null} [tracks]
 * @property {number|null} [maxSpeed]
 * @property {Structure|null} [structure]
 * @property {LineStatus|null} [status]
 * @property {number|null} [openedYear]
 * @property {number|null} [closedYear]
 * @property {'auto'|'diagonalFirst'|'straightFirst'} [schematicBend]
 * @property {SchematicPos[]} [schematicVia] 路線図の経由点
 * @property {GeoPos[]} [geoVia] 地理ビューの経由点
 */

/**
 * @typedef {object} NumberingRule
 * @property {boolean} enabled
 * @property {string} prefix 空なら路線記号を使う
 * @property {string} separator
 * @property {number} start
 * @property {number} step
 * @property {number} digits 1ならゼロ埋めなし
 * @property {boolean} fromEnd 終点側から振る
 * @property {'auto'|'fixed'} mode
 */

/**
 * @typedef {object} LineStop
 * @property {string} stationId
 * @property {number} [km] 起点からの営業キロ（手入力）
 * @property {string} [number] 確定済みの駅番号の番号部分（mode = 'fixed'）。例：'05'、'05-1'
 */

/**
 * @typedef {object} Line
 * @property {string} id
 * @property {string} operatorId
 * @property {string} name 正式な路線名
 * @property {string} [displayName] 系統名・愛称（図ではこちらを優先）
 * @property {Names} names
 * @property {LineKind} kind
 * @property {string} color
 * @property {string} symbol 路線記号
 * @property {boolean} isLoop
 * @property {'toStart'|'toEnd'} upDirection
 * @property {LineStop[]} stops 起点から順番に
 * @property {SectionAttrs} defaults
 * @property {SectionOverride[]} sections 長さ＝駅間の数（環状なら stops.length）
 * @property {NumberingRule} numbering
 * @property {LineStatus} status
 * @property {number} [openedYear]
 * @property {number} [closedYear]
 * @property {number} order 並走するときの並び順
 * @property {string} [note]
 */

/**
 * @typedef {object} LabelOpt
 * @property {'auto'|'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW'} pos
 * @property {number} [dx] 微調整（px、ズーム1基準）
 * @property {number} [dy]
 * @property {'horizontal'|'vertical'|'rot45'|'rotMinus45'} orientation
 * @property {string} [text] 表示用の上書き（改行可）
 * @property {boolean} [hidden]
 */

/**
 * @typedef {object} Station
 * @property {string} id
 * @property {string} name 主表記（地図の言語）
 * @property {string} [reading] よみ（日本語ならひらがな）
 * @property {Names} names
 * @property {boolean} autoRomanize
 * @property {string} [subName]
 * @property {string} [code3]
 * @property {StationRank} rank
 * @property {'ground'|'elevated'|'underground'|'semiUnderground'} structure
 * @property {{ type: 'island'|'side'|'bay'|'mixed', faces: number, tracks: number }} [platforms]
 * @property {('airport'|'port'|'busTerminal')[]} facilities
 * @property {string} [managedBy] 管理する事業者の ID
 * @property {string} [admin1]
 * @property {string} [admin2]
 * @property {string} [fareZone]
 * @property {GeoPos|null} geo
 * @property {SchematicPos|null} schematic
 * @property {{ schematic: LabelOpt, geo: LabelOpt }} label
 * @property {number} [openedYear]
 * @property {number} [closedYear]
 * @property {number} [ridership]
 * @property {string} [note]
 */

/**
 * @typedef {object} Interchange
 * @property {string} id
 * @property {string[]} stationIds
 * @property {number} walkMinutes
 * @property {boolean} showConnector
 */

/**
 * @typedef {object} ServiceType
 * @property {string} id
 * @property {string} operatorId
 * @property {string} name
 * @property {string} shortName
 * @property {Names} names
 * @property {string} color
 * @property {string} textColor
 * @property {number} rank
 * @property {boolean} surcharge
 * @property {'free'|'reserved'|'mixed'} seating
 * @property {{ base: 'all'|'majorAndAbove'|'terminalOnly'|'manual', interchanges: boolean }} stopRule
 * @property {number} dwellSec
 */

/**
 * @typedef {object} ServiceSegment
 * @property {string} lineId
 * @property {string} from 駅ID
 * @property {string} to 駅ID
 * @property {string} typeId
 * @property {'cw'|'ccw'} [loopDir]
 */

/**
 * @typedef {object} Service
 * @property {string} id
 * @property {string} [name]
 * @property {ServiceSegment[]} segments
 * @property {string[]} stops
 * @property {boolean} stopsAuto
 * @property {{ morning: number, day: number, evening: number, night: number }} frequency
 * @property {number} [cars]
 * @property {string} [rollingStockId]
 * @property {boolean} bothDirections
 * @property {string} [color]
 * @property {string} [note]
 */

/**
 * @typedef {object} RollingStock
 * @property {string} id
 * @property {string} name
 * @property {'emu'|'dmu'|'locoHauled'|'shinkansen'|'tram'|'monorail'|'agt'|'maglev'} kind
 * @property {number} maxSpeed
 * @property {number} accel
 * @property {number} decel
 * @property {Electrification[]} electrifications
 * @property {number[]} gauges
 * @property {number} capacityPerCar
 * @property {number} defaultCars
 * @property {string} bodyColor
 * @property {string} bandColor
 */

/**
 * @typedef {object} FareTable
 * @property {string} id
 * @property {string} operatorId
 * @property {'base'|'surcharge'} kind
 * @property {'distance'|'flat'|'zone'} model
 * @property {{ upToKm: number, fare: number }[]} [brackets]
 * @property {number} [flatFare]
 * @property {{ zones: number, fare: number }[]} [zoneFares]
 * @property {number} [transferDiscount]
 */

/**
 * @typedef {object} City
 * @property {string} id
 * @property {string} name
 * @property {string} [reading]
 * @property {Names} names
 * @property {GeoPos} pos
 * @property {number} population
 * @property {'metropolis'|'city'|'town'|'village'} kind
 * @property {string} [regionId]
 */

/** @typedef {{ id: string, name: string, reading?: string, names: Names, capitalCityId: string }} Region */

/**
 * 見た目の設定（§5.8。プリセットと詳細設定はフェーズ3）。長さは px（ズーム1基準）
 * @typedef {object} MapStyle
 * @property {string} preset
 * @property {number} lineWidth
 * @property {number} lineGap 並走する線のすき間
 * @property {number} cornerRadius
 * @property {number} stationRadius
 * @property {'gothic'|'mincho'|'maru'} fontFamily
 * @property {number} fontSize 駅名の文字の大きさ
 * @property {boolean} showSubNames 副表記（英字など）を出す
 * @property {boolean} showNumbering 駅番号バッジを出す
 * @property {'black'|'line'} stationStroke 駅の縁の色
 * @property {string} background
 * @property {boolean} showGrid
 * @property {boolean} showAbolished 廃止区間を表示する
 */

/**
 * @typedef {object} RomajiSettings
 * @property {'omit'|'macron'|'keep'} longVowel
 * @property {'m'|'n'} nBeforeBmp
 * @property {boolean} capitalizeAfterHyphen
 */

/**
 * プロジェクトごとの設定（§6 の各設定。フェーズごとに項目が増える）
 * @typedef {object} ProjectSettings
 * @property {RomajiSettings} romaji
 * @property {number} curveFactor 営業キロの曲線係数（§6.3）
 * @property {number} viaCurveFactor 経由点がある区間の係数
 * @property {number} runtimeMargin 所要時間の余裕率（§6.4）
 */

/** @typedef {{ cx: number, cy: number, zoom: number }} ViewState 表示の中心（ズーム1の px）と倍率 */

/**
 * @typedef {object} Project
 * @property {1} schemaVersion
 * @property {string} id
 * @property {string} name
 * @property {string} [author]
 * @property {string} createdAt ISO 8601
 * @property {string} updatedAt
 * @property {ProjectLocale} locale
 * @property {World} world
 * @property {Operator[]} operators
 * @property {Line[]} lines
 * @property {Station[]} stations
 * @property {Interchange[]} interchanges
 * @property {ServiceType[]} serviceTypes
 * @property {Service[]} services
 * @property {RollingStock[]} rollingStock
 * @property {FareTable[]} fareTables
 * @property {MapStyle} style
 * @property {ProjectSettings} settings
 * @property {{ schematic: ViewState, geo: ViewState }} view
 * @property {{ lastBackupAt?: string }} meta
 */

/**
 * 地域パック（js/core/regions/）
 * @typedef {object} RegionPack
 * @property {string} id
 * @property {string} nameKey
 * @property {ProjectLocale} locale
 * @property {boolean} autoRomanize
 * @property {string} romanizeFrom 英字を作るときの地図の言語
 * @property {string} romanizeTo
 * @property {RomajiSettings} romajiDefaults
 * @property {string[]} operatorCategories
 * @property {string} operatorCategoryKeyPrefix
 * @property {{ category: string, badgeShape: Operator['badgeShape'] }} operatorDefaults
 * @property {{ admin1: string, admin2: string }} adminLabelKeys
 * @property {Record<string, { gauge: number|null, electrification: Electrification, maxSpeed: number, accel: number, decel: number, spacingKm: number, collection: 'overhead'|'thirdRail', tracks: 1|2|3|4|6, structure: Structure }>} lineKindDefaults
 * @property {LineKind} defaultLineKind
 * @property {NumberingRule} numberingDefaults
 * @property {Array<{ id: string, labelKey: string, types: Array<object> }>} serviceTypePresets
 * @property {Array<{ maxRank: number, sec: number }>} dwellSecByRank
 */
