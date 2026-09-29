// サンプル（架空の都市圏）を作って samples/sample-metro.railmap.json に書き出す。
// アプリと同じアクションで組み立てるので、データの形が必ず正しくなる。実在の企業名は使わない。
// 使い方：node tools/make-sample.js
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject } from '../js/core/defaults.js';
import { createProjectStore } from '../js/core/actions/index.js';
import { checkIntegrity } from '../js/core/validate.js';
import { serializeProject } from '../js/storage/file-io.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = '2026-09-29T00:00:00.000Z';

const p = createProject({ id: 'pj_sample', name: 'サンプル：湾岸都市圏', author: '架空路線図メーカー', now: NOW });
const store = createProjectStore(p, { now: () => NOW });
const d = (action) => store.dispatch(action);

// ---------- 駅（名前・よみ・位置・ランク・付帯施設） ----------
const S = {};
const station = (key, name, reading, x, y, rank = 'normal', extra = {}) => {
  S[key] = d({ type: 'station/add', x, y, fields: { name, reading, rank, ...extra } });
};
// 環状線（9駅）
station('chuo', '中央', 'ちゅうおう', 0, -8, 'terminal', { facilities: ['busTerminal'] });
station('aoba', '青葉通', 'あおばどおり', 4, -8);
station('kitano', '北野', 'きたの', 8, -4);
station('towan', '東湾', 'とうわん', 8, 1, 'major');
station('sakura', '桜台', 'さくらだい', 6, 6);
station('minato', '港町', 'みなとまち', 0, 8, 'major', { facilities: ['port'] });
station('nishihama', '西浜', 'にしはま', -6, 6);
station('kawabata', '川端', 'かわばた', -8, 1);
station('asahi', '旭町', 'あさひまち', -6, -6);
// 地下鉄1号線（南北）と2号線（東西）
station('kitakoen', '北公園', 'きたこうえん', 0, -12);
station('shiyakusho', '市役所前', 'しやくしょ・まえ', 0, -4);
station('honcho', '本町', 'ほんちょう', 0, 1, 'major');
station('kencho', '県庁前', 'けんちょう・まえ', 0, 5);
station('nishikoen', '西公園', 'にしこうえん', -12, 1);
station('odori', '大通', 'おおどおり', -4, 1);
station('higashimachi', '東町', 'ひがしまち', 4, 1);
// みなと急行電鉄（東湾から臨海空港へ）
station('towanMk', '東湾', 'とうわん', 10, 3, 'normal');
station('kaigan', '海岸通', 'かいがんどおり', 13, 3);
station('rinkai', '臨海公園', 'りんかいこうえん', 16, 3);
station('wakaba', '若葉', 'わかば', 19, 0);
station('minatodai', 'みなと台', 'みなとだい', 22, 0);
station('airport', '臨海空港', 'りんかいくうこう', 25, 0, 'terminal', { facilities: ['airport'] });
// 緑ヶ丘電鉄（旭町から森林公園へ）
station('asahiMg', '旭町', 'あさひまち', -8, -8);
station('sakurai', '桜井', 'さくらい', -11, -11);
station('okanoue', '丘の上', 'おかのうえ', -14, -14);
station('midori', '緑ヶ丘', 'みどりがおか', -18, -14);
station('shinrin', '森林公園', 'しんりんこうえん', -22, -14, 'terminal');

// 「おかのうえ」は §6.1 の規則では「のう」が長音になり Okanoe になるので、英字を手で入れる
d({ type: 'station/update', stationId: S.okanoue, fields: { autoRomanize: false, names: { en: 'Okanoue' } } });

// ---------- 事業者 ----------
const opJ = d({ type: 'operator/add', fields: { name: '湾岸旅客鉄道', shortName: '湾岸鉄道', category: 'jr', color: '#2E7D32', textColor: '#FFFFFF', badgeShape: 'square', names: { en: 'Wangan Railway' } } });
const opMk = d({ type: 'operator/add', fields: { name: 'みなと急行電鉄', shortName: 'みなと急行', category: 'major', color: '#E8541E', textColor: '#FFFFFF', badgeShape: 'roundSquare', names: { en: 'Minato Express Railway' } } });
const opMg = d({ type: 'operator/add', fields: { name: '緑ヶ丘電鉄', shortName: '緑電', category: 'semiMajor', color: '#1E6FD9', textColor: '#FFFFFF', badgeShape: 'pill', names: { en: 'Midorigaoka Electric Railway' } } });
const opSub = d({ type: 'operator/add', fields: { name: '湾岸市交通局', shortName: '湾岸市営', category: 'public', color: '#0E9AA7', textColor: '#FFFFFF', badgeShape: 'circle', names: { en: 'Wangan City Transportation Bureau' } } });

// ---------- 路線 ----------
const line = (fields, keys, numbering) => {
  const id = d({ type: 'line/add', fields, stationIds: keys.map((k) => S[k]) });
  if (numbering) d({ type: 'line/numbering', lineId: id, fields: { enabled: true, ...numbering } });
  return id;
};
const ring = line({ operatorId: opJ, name: '湾岸環状線', names: { en: 'Wangan Loop Line' }, color: '#9ACD32', symbol: 'JC', kind: 'conventional' },
  ['chuo', 'aoba', 'kitano', 'towan', 'sakura', 'minato', 'nishihama', 'kawabata', 'asahi'], { digits: 2 });
d({ type: 'line/setLoop', lineId: ring, isLoop: true });
line({ operatorId: opSub, name: '1号線', displayName: '南北線', names: { en: 'Line 1 (North-South)' }, color: '#F7A600', symbol: 'A', kind: 'subway' },
  ['kitakoen', 'chuo', 'shiyakusho', 'honcho', 'kencho', 'minato'], { digits: 2 });
line({ operatorId: opSub, name: '2号線', displayName: '東西線', names: { en: 'Line 2 (East-West)' }, color: '#7A4FBF', symbol: 'B', kind: 'subway' },
  ['nishikoen', 'kawabata', 'odori', 'honcho', 'higashimachi', 'towan'], { digits: 2 });
line({ operatorId: opMk, name: 'みなと急行本線', names: { en: 'Minato Express Main Line' }, color: '#E8541E', symbol: 'MK', kind: 'conventional' },
  ['towanMk', 'kaigan', 'rinkai', 'wakaba', 'minatodai', 'airport'], { digits: 2 });
line({ operatorId: opMg, name: '緑ヶ丘線', names: { en: 'Midorigaoka Line' }, color: '#1E6FD9', symbol: 'MG', kind: 'conventional' },
  ['asahiMg', 'sakurai', 'okanoue', 'midori', 'shinrin'], { digits: 2 });

// ---------- 乗換グループ（別の駅どうしを徒歩で乗換） ----------
d({ type: 'interchange/add', stationIds: [S.towan, S.towanMk] });
d({ type: 'interchange/add', stationIds: [S.asahi, S.asahiMg] });
const ics = store.getState().interchanges;
d({ type: 'interchange/update', interchangeId: ics[0].id, fields: { walkMinutes: 3 } });
d({ type: 'interchange/update', interchangeId: ics[1].id, fields: { walkMinutes: 4 } });

// ---------- 表示位置 ----------
d({ type: 'project/view', view: 'schematic', state: { cx: 24, cy: -48, zoom: 1 }, silent: true });

const out = { ...store.getState(), updatedAt: NOW };
const problems = checkIntegrity(out);
if (problems.length) {
  console.error('サンプルに問題があります', problems);
  process.exit(1);
}
const file = join(ROOT, 'samples', 'sample-metro.railmap.json');
writeFileSync(file, serializeProject(out) + '\n');
console.log(`wrote ${file}（駅 ${out.stations.length}・路線 ${out.lines.length}・乗換 ${out.interchanges.length}）`);
