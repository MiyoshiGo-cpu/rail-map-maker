// 日本語カタログ。キーは「画面.役割」の英語。値の {name} は差し込み。
// 600行を超えそうなら ja-*.js に分けて、ここで結合する。
export default {
  // アプリ全体
  'app.title': '架空路線図メーカー',
  'app.loading': '読み込んでいます…',
  'app.error.module': '起動できませんでした。ページを再読み込みしてください。',

  // 共通
  'common.ok': 'OK',
  'common.cancel': 'キャンセル',
  'common.close': '閉じる',
  'common.save': '保存する',
  'common.delete': '削除する',
  'common.add': '追加する',
  'common.edit': '編集する',
  'common.back': '戻る',
  'common.yes': 'はい',
  'common.no': 'いいえ',
  'common.none': 'なし',
  'common.auto': '自動',
  'common.more': 'その他の操作',
  'common.name': '名前',
  'common.note': 'メモ',
  'common.color': '色',
  'common.textColor': '文字の色',
  'common.search': '検索',
  'common.filter': '絞り込み',
  'common.move': '移動',
  'common.moveUp': '上へ',
  'common.moveDown': '下へ',
  'common.duplicate': '複製する',
  'common.rename': '名前を変える',
  'common.untitled': '（名前なし）',
  'common.count': '{count}件',

  // エラー（共通）
  'error.nameRequired': '名前を入力してください。',

  // 保存
  'storage.unavailable': 'この環境ではブラウザに保存できません。プライベートブラウズの場合は、通常のウィンドウで開いてください。',
  'save.saved': '保存済み',
  'save.dirty': '未保存',
  'save.saving': '保存中…',
  'save.error': '保存できません',
  'save.failed': '保存に失敗しました。端末の空き容量を確かめてから、もう一度操作してください。',
  'save.invalidDetail': 'データに問題があるため保存していません（{detail}）。直前の操作を取り消してください。',

  // プロジェクト一覧
  'plist.new': '新しいプロジェクト',
  'plist.empty': 'プロジェクトがありません。「新しいプロジェクト」から作ってください。',
  'plist.counts': '駅 {stations}・路線 {lines}',
  'plist.updated': '更新 {date}',
  'plist.actions': '「{name}」の操作',
  'plist.renameTitle': 'プロジェクトの名前を変える',
  'plist.renamed': '名前を変えました',
  'plist.duplicated': '複製しました',
  'plist.deleted': '削除しました',
  'plist.deleteConfirm.title': 'プロジェクトを削除しますか？',
  'plist.deleteConfirm.message': '「{name}」を削除します。削除すると元に戻せません。',

  // 新規作成
  'newProject.title': '新しいプロジェクト',
  'newProject.name': 'プロジェクト名',
  'newProject.author': '作者名（任意）',
  'newProject.world': '地形',
  'newProject.world.none': '路線図のみ',
  'newProject.create': '作る',

  // エディタ
  'editor.backToList': 'プロジェクト一覧へ',
  'editor.projectMenu': 'プロジェクトのメニュー',
  'editor.undo': '取り消す',
  'editor.redo': 'やり直す',
  'editor.notFound': 'プロジェクトが見つかりません。一覧から開き直してください。',
  'views.label': '表示の切り替え',
  'views.schematic': '路線図',
  'panel.label': 'プロパティ',
  'panel.resize': 'パネルの大きさを変える',
  'panel.project.title': 'プロジェクト',
  'hint.empty': '「駅」を選び、画面をタップして駅を置いてください',
  'hint.placeStation': '画面をタップして駅を置いてください',

  // ツール
  'tool.label': 'ツール',
  'tool.select': '選択',
  'tool.select.title': '選択（V）',
  'tool.station': '駅',
  'tool.station.title': '駅を置く（S）',
  'tool.line': '路線',
  'tool.line.title': '路線を引く（L）',
  'tool.delete': '削除',
  'tool.delete.title': '削除（E）',
  'tool.line.panelTitle': '路線を引く',
  'tool.line.target': '引く路線',
  'tool.line.newLine': '新しい路線',
  'tool.line.firstOperator': '（最初の事業者）',
  'tool.line.autoOperator': '（自動で作る）',
  'tool.line.howTo': '駅を順にタップしてください。何もない所をタップすると、駅も作って追加します。',
  'tool.line.drawing': '{name}：{count}駅。続けて駅をタップするか、「完了」を押してください。',
  'tool.line.finish': '完了',
  'tool.line.alreadyInLine': 'この駅はすでにこの路線に入っています。',
  'tool.line.loopCannotExtend': '環状線は延長できません。環状をやめてから延長してください。',
  'tool.line.loopTitle': '環状線にしますか？',
  'tool.line.loopMessage': '始点の駅に戻りました。この路線を環状線にします。',
  'tool.line.makeLoop': '環状線にする',
  'tool.line.insertStation': 'ここに駅を挿入する',
  'tool.line.toggleBend': '曲がり位置を切り替える',

  // 路線
  'line.operator': '事業者',
  'line.name': '路線名',
  'line.color': 'ラインカラー',
  'line.symbol': '路線記号',
  'line.delete': '路線を削除する',
  'line.summary': '駅 {count}',
  'line.sectionSummary': '{index}番目の区間（全{count}駅）',
  'line.deleteNamed': '「{name}」を削除する',
  'line.deleted': '「{name}」を削除しました',
  'section.delete': 'この区間を削除する',
  'section.deleted': '区間を削除しました',

  // 駅
  'station.name': '駅名',
  'station.reading': 'よみ',
  'station.unnamed': '（駅名なし）',
  'station.delete': '駅を削除する',
  'station.deleted': '駅を削除しました',
  'station.deletedMany': '{count}駅を削除しました',
  'station.branch': 'この駅から新しい路線を分岐する',
  'stations.selected': '{count}駅を選択中',
  'stations.delete': '選んだ駅を削除する',
  'move.blocked': 'ほかの駅と重なるため動かせません。',
  'range.toggle': '範囲を選ぶ',
  'align.title': '整列',
  'align.horizontal': '横一列',
  'align.vertical': '縦一列',
  'align.diagonal': '斜め一列',
  'align.even': '等間隔',
  'align.blocked': 'ほかの駅と重なるため整列できません。',

  'canvas.zoomIn': '拡大',
  'canvas.zoomOut': '縮小',
  'canvas.fit': '全体を表示',

  // 単位
  'unit.km': '{value} km',
  'unit.mi': '{value} mi',
  'unit.kmh': '{value} km/h',
  'unit.mm': '{value} mm',
  'unit.minutes': '{value}分',
  'unit.seconds': '{value}秒',
  'unit.people': '{value}人',
  'unit.year': '{value}年',

  // 列挙：路線の種類
  'lineKind.shinkansen': '新幹線',
  'lineKind.conventional': '在来線',
  'lineKind.subway': '地下鉄',
  'lineKind.tram': '路面電車',
  'lineKind.monorail': 'モノレール',
  'lineKind.agt': '新交通システム',
  'lineKind.cable': 'ケーブルカー',
  'lineKind.maglev': 'リニア',
  'lineKind.freight': '貨物線',

  // 列挙：電化方式
  'electrification.none': '非電化',
  'electrification.dc600': '直流600V',
  'electrification.dc750': '直流750V',
  'electrification.dc1500': '直流1500V',
  'electrification.dc3000': '直流3000V',
  'electrification.ac15k16': '交流15kV・16.7Hz',
  'electrification.ac20k50': '交流20kV・50Hz',
  'electrification.ac20k60': '交流20kV・60Hz',
  'electrification.ac25k50': '交流25kV・50Hz',
  'electrification.ac25k60': '交流25kV・60Hz',

  // 列挙：集電方式
  'collection.overhead': '架線',
  'collection.thirdRail': '第三軌条',

  // 列挙：線路の数
  'tracks.1': '単線',
  'tracks.2': '複線',
  'tracks.3': '三線',
  'tracks.4': '複々線',
  'tracks.6': '三複線',

  // 列挙：構造
  'structure.ground': '地上',
  'structure.elevated': '高架',
  'structure.underground': '地下',
  'structure.cutting': '掘割',
  'structure.tunnel': 'トンネル',
  'structure.bridge': '橋梁',
  'structure.semiUnderground': '半地下',

  // 列挙：状態
  'status.open': '営業中',
  'status.construction': '建設中',
  'status.planned': '計画',
  'status.suspended': '休止',
  'status.abolished': '廃止',

  // 列挙：駅のランク
  'rank.terminal': 'ターミナル',
  'rank.major': '主要駅',
  'rank.normal': '一般駅',
  'rank.unstaffed': '無人駅',
  'rank.temporary': '臨時駅',
  'rank.signal': '信号場',
  'rank.freight': '貨物駅',
  'rank.depot': '車両基地',

  // 列挙：ホーム
  'platform.island': '島式',
  'platform.side': '相対式',
  'platform.bay': '頭端式',
  'platform.mixed': '複合',
  'platform.summary': '{faces}面{tracks}線',

  // 列挙：付帯施設
  'facility.airport': '空港',
  'facility.port': '港',
  'facility.busTerminal': 'バスターミナル',

  // 列挙：バッジの形
  'badgeShape.square': '四角',
  'badgeShape.roundSquare': '角丸四角',
  'badgeShape.circle': '丸',
  'badgeShape.pill': 'だ円',
  'badgeShape.none': 'なし',

  // 列挙：上り方向
  'upDirection.toStart': '起点方向が上り',
  'upDirection.toEnd': '終点方向が上り',

  // 列挙：ラベルの位置と向き
  'labelPos.auto': '自動',
  'labelPos.N': '上',
  'labelPos.NE': '右上',
  'labelPos.E': '右',
  'labelPos.SE': '右下',
  'labelPos.S': '下',
  'labelPos.SW': '左下',
  'labelPos.W': '左',
  'labelPos.NW': '左上',
  'labelOrientation.horizontal': '横書き',
  'labelOrientation.vertical': '縦書き',
  'labelOrientation.rot45': '45°回転',
  'labelOrientation.rotMinus45': '−45°回転',

  // 列挙：曲がり位置
  'bend.auto': '自動',
  'bend.diagonalFirst': '斜め→直線',
  'bend.straightFirst': '直線→斜め',

  // 地域パック jp の区分・行政区分
  'operatorCategory.jr': 'JR',
  'operatorCategory.major': '大手私鉄',
  'operatorCategory.semiMajor': '準大手私鉄',
  'operatorCategory.minor': '中小私鉄',
  'operatorCategory.public': '公営',
  'operatorCategory.thirdSector': '第三セクター',
  'operatorCategory.freight': '貨物',
  'operatorCategory.other': 'その他',
  'region.jp.name': '日本',
  'region.jp.admin1': '都道府県',
  'region.jp.admin2': '市区町村',
  'preset.serviceSet.jrConventional': 'JR在来線',
  'preset.serviceSet.private': '私鉄',
  'preset.serviceSet.subway': '地下鉄',
  'preset.serviceSet.shinkansen': '新幹線',
  'preset.serviceSet.tram': '路面電車',

  // 英字の規則
  'romaji.longVowel.omit': '省略する（Tokyo）',
  'romaji.longVowel.macron': 'マクロン（Tōkyō）',
  'romaji.longVowel.keep': 'そのまま（Toukyou）',
  'romaji.nBeforeBmp.m': 'b・m・p の前は m（Shimbashi）',
  'romaji.nBeforeBmp.n': '常に n（Shinbashi）',

  // 地図に描く定型文・既定の名前（地図の言語で使う）
  'map.default.operatorName': '事業者{n}',
  'map.default.operatorShort': '事業者{n}',
  'map.default.lineName': '路線{n}',
  'map.default.projectName': '新しい路線図',
  'map.copySuffix': '{name}（コピー）',
  'map.lineSplitSuffix': '{name}（{n}）',
};
