// 日本語カタログのうち、フェーズ2（営業キロ・種別・系統・停車駅案内図）の文言。ja.js で結合する
export default {
  // 営業キロ（§6.3）
  'km.estimated': '概算',
  'km.withEstimated': '{value}（概算）',
  'km.summary': '営業キロ {km}・{count}駅',
  'km.estimatedHint': '営業キロを入れていない駅間は、路線の種類ごとの目安の駅間で出した概算です。',
  'km.sectionValue': '駅間の営業キロ {value}',
  'km.loopBack': '起点に戻る（一周）',
  'km.loopOf': '{name}の一周の営業キロ',

  // チェック（§6.6）
  'check.sectionShort': '「{name}」の{a}〜{b}の駅間が{km}しかありません。営業キロを確かめてください。',
  'check.sectionLong': '「{name}」の{a}〜{b}の駅間が{km}あります。営業キロを確かめてください。',
  'check.kmEstimated': '「{name}」は営業キロが入っていない駅間があり、概算で計算しています。',
};
