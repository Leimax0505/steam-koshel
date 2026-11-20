/* =========================================================================
   Steam Koshel — front-end
   Live mode only: the FastAPI backend on the same origin serves /api/...
   All analytics live here, so rendering stays in one place.
   ========================================================================= */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 0. tiny helpers
   * ------------------------------------------------------------------ */

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = String(html).trim();
    return t.content.firstElementChild;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function sum(arr, f) { return arr.reduce(function (a, x) { return a + (f ? f(x) : x); }, 0); }
  function round(n, d) { var p = Math.pow(10, d || 0); return Math.round(n * p) / p; }

  function hash31(str) {
    var h = 7;
    for (var i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) >>> 0;
    return h >>> 0;
  }

  function store(key, val) {
    try {
      if (val === undefined) {
        var v = localStorage.getItem(key);
        return v == null ? null : JSON.parse(v);
      }
      localStorage.setItem(key, JSON.stringify(val));
      return val;
    } catch (e) { return null; }
  }

  /* ------------------------------------------------------------------ *
   * 1. i18n — every string in one table, three languages
   * ------------------------------------------------------------------ */

  var STRINGS = {
    tabOverview: ['Обзор', 'Overview', '概览'],
    tabLibrary: ['Библиотека', 'Library', '游戏库'],
    tabLegacy: ['Трофеи и История', 'Legacy', '成就与历史'],
    tabSocial: ['Сравнение и Друзья', 'Social', '对比与好友'],

    heroEyebrow: ['Steam-профиль, собранный в один портрет', 'Your Steam profile, in one portrait', '你的 Steam 档案，一张画像'],
    heroTitleA: ['Твоя библиотека —', 'Your library is', '你的游戏库，'],
    heroTitleB: ['не просто список игр', 'more than a list of games', '不止是一串游戏'],
    heroSub: [
      'Вставь ссылку на профиль Steam — получим стоимость коллекции, часы, трофеи и честный портрет твоих вкусов. Без регистрации и без пароля.',
      'Drop in your Steam profile link — get your collection value, hours, trophies and an honest portrait of your taste. No sign-up, no password.',
      '粘贴你的 Steam 个人资料链接 —— 立刻得到库存价值、游戏时长、成就，以及一份诚实的口味画像。无需注册，无需密码。'
    ],
    searchPh: ['Ссылка на профиль, SteamID64 или никнейм', 'Profile link, SteamID64 or nickname', '个人资料链接、SteamID64 或昵称'],
    analyze: ['Проверить', 'Analyze', '分析'],
    whereLink: ['Где взять ссылку?', 'Where is the link?', '链接在哪？'],
    whereLink1: ['Открой свой профиль Steam в браузере и скопируй ссылку из адресной строки.',
      'Open your Steam profile in a browser and copy the link from the address bar.',
      '在浏览器中打开你的 Steam 资料页，复制地址栏里的链接。'],
    whereLink2: ['Вставь её в поиск выше. Подойдёт и просто никнейм — найдём сами.',
      'Paste it above. A plain nickname works too — we will resolve it.',
      '粘贴到上方搜索框。只填昵称也可以，我们会自动找到你。'],
    privacyNote: ['Только открытые данные Steam. Пароль не нужен и не запрашивается.',
      'Only public Steam data. Your password is never asked for.',
      '仅读取公开的 Steam 数据，绝不索取你的密码。'],

    privateTitle: ['Профиль закрыт от посторонних', 'This profile is private', '该资料页未公开'],
    privateSub: ['Steam отдаёт статистику только для открытых профилей. Это две галочки в настройках — и всё заработает.',
      'Steam only shares stats for public profiles. Two checkboxes in settings and it will work.',
      'Steam 只向公开的资料页提供数据。在设置里勾选两项即可。'],
    privateStep1: ['Открой Steam → «Профиль» → «Изменить профиль» → «Настройки приватности».',
      'Steam → Profile → Edit profile → Privacy settings.', 'Steam → 个人资料 → 编辑个人资料 → 隐私设置。'],
    privateStep2: ['Поставь «Открыто» для пункта «Детали игр» (Game details).',
      'Set “Game details” to Public.', '将“游戏详情”设为公开。'],
    privateStep3: ['Сохрани и вернись сюда — нажми «Проверить» ещё раз.',
      'Save, come back and hit Analyze again.', '保存后返回这里，再点一次“分析”。'],
    retry: ['Проверить снова', 'Try again', '重试'],
    errorTitle: ['Не удалось получить профиль', 'Could not load the profile', '无法加载档案'],
    errorOffline: ['Нужен запущенный бэкенд. Запусти сервер и открой http://127.0.0.1:8000.',
      'The backend must be running. Start the server and open http://127.0.0.1:8000.',
      '需要运行后端。启动服务器并打开 http://127.0.0.1:8000。'],
    errorGeneric: ['Steam не отдал данные. Профиль существует, но сервис временно недоступен — попробуй ещё раз.',
      'Steam did not return the data. The profile exists, but the service is temporarily unavailable — try again.',
      'Steam 未返回数据。档案存在，但服务暂时不可用 —— 请重试。'],
    errorNoKey: ['Серверу нужен ключ Steam Web API. Добавь STEAM_API_KEY в .env и перезапусти бэкенд.',
      'The server needs a Steam Web API key. Add STEAM_API_KEY to .env and restart the backend.',
      '服务器需要 Steam Web API 密钥。请在 .env 中添加 STEAM_API_KEY 并重启后端。'],
    steamLevel: ['Уровень Steam', 'Steam level', 'Steam 等级'],
    paidWord: ['платных', 'paid', '付费'],

    loadStep1: ['Ищем профиль по ссылке или нику', 'Resolving the profile link', '解析资料链接'],
    loadStep2: ['Считаем стоимость библиотеки и инвентаря', 'Pricing the library and inventory', '计算库存与饰品价值'],
    loadStep3: ['Анализируем трофеи, жанры и привычки', 'Reading achievements, genres and habits', '分析成就、类型与习惯'],
    loadStep4: ['Собираем портрет игрока', 'Composing your portrait', '生成玩家画像'],

    liveBadge: ['живые данные Steam', 'live Steam data', 'Steam 实时数据'],
    cachedBadge: ['из кэша', 'from cache', '来自缓存'],

    passport: ['Digital Passport', 'Digital Passport', '数字护照'],
    openProfile: ['Открыть профиль в Steam', 'Open Steam profile', '打开 Steam 资料'],
    downloadPng: ['Скачать PNG', 'Download PNG', '下载 PNG'],
    copyBB: ['Скопировать BB-код', 'Copy BB code', '复制 BB 代码'],
    copied: ['Скопировано', 'Copied', '已复制'],
    copyFailed: ['Не удалось скопировать — выдели текст вручную', 'Copy failed — select the text manually', '复制失败，请手动选择文本'],

    historyTitle: ['Последние проверки', 'Recent lookups', '最近查看'],
    historyEmpty: ['Здесь появятся профили, которые ты проверишь.', 'Profiles you check will show up here.', '你查看过的档案会出现在这里。'],
    clearHistory: ['Очистить', 'Clear', '清空'],

    oHours: ['Время в играх', 'Hours played', '游戏时长'],
    oGames: ['Игр в библиотеке', 'Games owned', '游戏数量'],
    oInventory: ['Инвентарь', 'Inventory', '库存饰品'],
    oPortfolio: ['Портфель целиком', 'Portfolio total', '总资产'],
    costPerHour: ['Цена одного часа', 'Cost per hour', '每小时成本'],
    avgPerGame: ['в среднем {n} ч на игру', 'avg {n} h per game', '平均每款 {n} 小时'],
    playedOf: ['запускали {n} из {m}', 'played {n} of {m}', '玩过 {n}/{m}'],
    inventoryHidden: ['Инвентарь скрыт', 'Inventory is private', '库存未公开'],
    inventoryEmpty: ['Инвентарь пуст', 'Inventory is empty', '库存为空'],
    costPerHourHint: ['Сколько стоит час твоего удовольствия', 'What an hour of your fun costs', '你的快乐每小时多少钱'],
    inventoryTotal: ['всего предметов', 'total items', '物品总数'],

    curatorTitle: ['AI-куратор', 'AI curator', 'AI 策展人'],
    curatorBadge: ['локальный анализ', 'local analysis', '本地分析'],
    curatorThinking: ['Куратор перечитывает библиотеку…', 'The curator is re-reading your library…', '策展人正在重读你的游戏库…'],

    genreTitle: ['Жанровый компас', 'Genre compass', '类型罗盘'],
    genreSub: ['Куда на самом деле уходит время', 'Where the hours actually go', '时间真正去了哪里'],
    qualityTitle: ['Средний рейтинг игр', 'Average game rating', '游戏平均评分'],
    qualitySub: ['Средняя оценка критиков по библиотеке', 'Average critic score across your library', '库内游戏的媒体平均分'],
    avgRating: ['Средняя оценка', 'Average score', '平均分'],
    ratedGames: ['{n} игр с оценкой критиков', '{n} games with critic scores', '{n} 款有媒体评分'],
    hypeTrend: ['В тренде', 'On trend', '紧跟潮流'],
    hypeHidden: ['Искатель скрытых шедевров', 'Hidden-gem hunter', '隐藏佳作猎人'],
    hypeBalanced: ['Здоровый баланс', 'Healthy balance', '平衡玩家'],
    hiddenGems: ['Скрытые шедевры', 'Hidden gems', '隐藏佳作'],

    rhythmTitle: ['Биоритм', 'Rhythm', '生物钟'],
    nightOwl: ['Ночной страж', 'Night watch', '守夜人'],
    dayTact: ['Дневной тактик', 'Day tactician', '白昼战术家'],
    evening: ['Вечерний игрок', 'Evening player', '夜间玩家'],
    rhythmNote: ['Пик активности — около {h}:00. {p}% всех часов приходится на это окно.',
      'Your peak is around {h}:00. {p}% of all hours land in that window.',
      '高峰在 {h}:00 左右。{p}% 的时长集中在这一时段。'],

    cleanTitle: ['Чистота аккаунта', 'Account status', '账号状态'],
    cleanOk: ['Чисто', 'Clean', '清白'],
    cleanWarn: ['Есть отметки', 'Flags found', '存在标记'],
    cleanNote: ['VAC, игровые, торговые и общественные блокировки.', 'VAC, game, trade and community bans.', 'VAC、游戏、交易与社区封禁。'],
    noBans: ['Блокировок не обнаружено', 'No bans found', '未发现封禁'],
    cleanUnknown: ['Steam не отдал данные о блокировках', 'Steam did not return ban data', 'Steam 未返回封禁数据'],
    cleanVac: ['VAC-блокировки', 'VAC bans', 'VAC 封禁'],
    cleanGame: ['Игровые блокировки', 'Game bans', '游戏封禁'],
    cleanTrade: ['Торговые блокировки', 'Trade bans', '交易封禁'],
    cleanCommunity: ['Блокировки сообщества', 'Community bans', '社区封禁'],
    cleanLastBan: ['Последняя блокировка {n} дн. назад', 'Last ban {n} days ago', '最近封禁在 {n} 天前'],

    libraryValue: ['Стоимость библиотеки', 'Library value', '游戏库价值'],
    libraryValueNote: ['Сумма текущих цен всех игр с известной ценой.', 'Sum of current prices for every priced game.', '按现价汇总所有有价格的游戏。'],
    mostExpensive: ['Самая дорогая игра', 'Most expensive game', '最贵的游戏'],
    avgGamePrice: ['Средняя цена игры', 'Average game price', '游戏平均价格'],
    realCostPerHour: ['Реальная цена часа', 'Real cost per hour', '真实每小时成本'],
    pricedOf: ['Оценка по {n} играм с известной ценой из {m}', 'Estimated from {n} priced games of {m}', '基于 {m} 款中 {n} 款有价格的游戏估算'],

    backlogTitle: ['Непройденные игры', 'Unplayed games', '未玩过的游戏'],
    backlogGames: ['{n} игр ждут первого запуска', '{n} games await their first launch', '{n} 款游戏等待首次启动'],
    backlogTime: ['Время на прохождение', 'Time to finish', '通关所需时间'],
    backlogValue: ['Стоимость нетронутого', 'Value untouched', '未玩价值'],
    backlogNote: ['Оценка по 2 часа в день и средней длине игр в запасе.',
      'Estimated at 2 hours a day and the average length of your backlog.',
      '按每天 2 小时与库存游戏的平均时长估算。'],
    days: ['дней', 'days', '天'],
    daysTotal: ['за всё время', 'in total', '累计'],
    hoursShort: ['ч', 'h', '小时'],

    libTitle: ['Библиотека под контролем', 'Library, under control', '掌控你的游戏库'],
    libSub: ['Фильтры в один клик и честный подбор на вечер.',
      'One-click filters and an honest pick for tonight.',
      '一键筛选，诚实地挑一个今晚玩的。'],
    allGames: ['Все игры', 'All games', '全部游戏'],
    filterAll: ['Все', 'All', '全部'],
    filterCoop: ['Кооператив', 'Co-op', '合作'],
    filterWeekend: ['Пройти за выходные', 'Weekend-sized', '周末通关'],
    filterNever: ['Не запускал', 'Never played', '未启动'],
    filterMasterpiece: ['Шедевры 85%+', 'Gems 85%+', '佳作 85+'],
    filterShort: ['До 15 часов', 'Under 15 hours', '15 小时以内'],
    searchGames: ['Поиск по названию', 'Search by title', '按名称搜索'],
    noGames: ['Под эти фильтры пока ничего не подходит.', 'Nothing matches these filters yet.', '没有符合这些筛选条件的游戏。'],
    neverLabel: ['ни разу', 'never', '未玩'],
    smartPickTitle: ['На вечер', 'For tonight', '今晚玩什么'],
    smartPickSub: ['Подобрано по времени, жанрам и тому, что давно ждёт.',
      'Chosen by time, favourite genres and what has been waiting too long.',
      '依据时长、喜爱的类型和等待时间挑选。'],
    pickAgain: ['Ещё вариант', 'Another one', '换一个'],
    playNow: ['Запустить', 'Launch', '启动'],
    weekendBadge: ['выходные', 'weekend', '周末'],
    coopBadge: ['кооп', 'co-op', '合作'],
    softwareBadge: ['утилита', 'utility', '工具'],

    legacyRareTitle: ['Самые редкие трофеи', 'Rarest trophies', '最稀有的成就'],
    legacyRareSub: ['Процент игроков, которые это получили', 'Share of players who got these', '获得这些成就的玩家比例'],
    legacyClosestTitle: ['В шаге от платины', 'One step from platinum', '距白金一步之遥'],
    legacyClosestSub: ['Игры, где открыто 85–99% достижений', 'Games at 85–99% completion', '完成度 85%–99% 的游戏'],
    legacyCapsuleTitle: ['Капсула времени', 'Time capsule', '时间胶囊'],
    legacyFirstAch: ['Самое первое достижение', 'Your very first achievement', '你的第一个成就'],
    legacyTimelineTitle: ['Машина времени', 'Time machine', '时间机器'],
    legacyTimelineSub: ['Выбери год и посмотри, во что ты тогда играл', 'Pick a year and see what you played', '选择年份，看看当年在玩什么'],
    legacyMuseumTitle: ['Музей удалённых игр', 'Museum of delisted games', '下架游戏博物馆'],
    legacyMuseumSub: ['Их больше не купить в Steam — но они твои навсегда', 'No longer sold on Steam — but forever yours', 'Steam 上已买不到，但永远属于你'],
    legacyMuseumEmpty: ['Пока пусто. Если игры исчезнут из магазина — они появятся здесь.',
      'Empty for now. If a game leaves the store, it shows up here.',
      '暂时为空。若有游戏从商店下架，会出现在这里。'],
    removedFromStore: ['снята с продажи', 'delisted', '已下架'],
    achProgress: ['{a} из {t}', '{a} of {t}', '{a} / {t}'],
    achievementsWord: ['Достижений', 'Achievements', '成就'],
    yearSummary: ['{h} часов · {g} игр', '{h} hours · {g} games', '{h} 小时 · {g} 款游戏'],
    yearShare: ['{p}% всего времени', '{p}% of all playtime', '占全部时长的 {p}%'],
    yearAvg: ['в среднем {h} ч на игру', 'avg {h} h per game', '平均每款 {h} 小时'],
    firstAchOn: ['получено {d}', 'unlocked {d}', '解锁于 {d}'],

    socialCompareTitle: ['Баттл 1 на 1', 'Head to head', '一对一'],
    socialCompareSub: ['Вставь ссылку друга — сравним без обид', 'Paste a friend’s link — a friendly comparison', '粘贴好友链接，友好对比'],
    compareYou: ['Ты', 'You', '你'],
    compareFriend: ['Соперник', 'Rival', '对手'],
    compareBtn: ['Сравнить', 'Compare', '对比'],
    comparePlaceholder: ['Ссылка на профиль друга', 'Friend’s profile link', '好友资料链接'],
    compareVerdict: ['{w} впереди по {n} из {m} показателей', '{w} leads on {n} of {m} metrics', '{w} 在 {m} 项中 {n} 项领先'],
    compareDraw: ['Полная ничья по всем показателям', 'A perfect draw on every metric', '所有指标完全打平'],
    metricHours: ['Часы', 'Hours', '时长'],
    metricGames: ['Игры', 'Games', '游戏'],
    metricValue: ['Портфель', 'Portfolio', '资产'],
    metricAch: ['Трофеи', 'Trophies', '成就'],
    metricInventory: ['Инвентарь', 'Inventory', '库存'],
    metricAchRatio: ['Собрано достижений', 'Achievement completion', '成就完成度'],
    metricQuality: ['Средний рейтинг игр', 'Average game rating', '游戏平均评分'],
    metricAvgHours: ['Часов на игру', 'Hours per game', '每款游戏时长'],
    metricPerfect: ['Пройдено на 100%', 'Completed 100%', '100% 通关数'],
    metricLevel: ['Уровень Steam', 'Steam level', 'Steam 等级'],
    metricAge: ['Лет в Steam', 'Years on Steam', 'Steam 年资'],
    metricFriends: ['Друзей', 'Friends', '好友数'],
    compareNeedFriend: ['Нужна ссылка на реальный профиль друга.', 'A real friend profile link is required.', '需要好友的真实资料链接。'],

    friendsTitle: ['Идеальный напарник', 'The perfect co-op partner', '完美队友'],
    friendsSub: ['Совместимость по общим несыгранным кооперативным играм', 'Chemistry from shared unplayed co-op games', '基于共同未玩的合作游戏计算契合度'],
    friendsEmpty: ['Список друзей закрыт или пуст.', 'The friend list is private or empty.', '好友列表未公开或为空。'],
    friendsDrag: ['Перетащи друга в слот Игрока 1 или Игрока 2. Правый клик — быстрые действия.', 'Drag a friend into Player 1 or Player 2. Right-click for quick actions.', '把好友拖到玩家 1 或玩家 2 的槽位，右键查看更多操作。'],
    rivalDrop: ['Перетащи друга сюда', 'Drop a friend here', '把好友拖到这里'],
    menuSlotA: ['Поставить в Игрока 1', 'Set as Player 1', '设为玩家 1'],
    menuSlotB: ['Поставить в Игрока 2', 'Set as Player 2', '设为玩家 2'],
    menuOpenSteam: ['Открыть профиль', 'Open profile', '打开资料'],
    duelPlayer1: ['Игрок 1', 'Player 1', '玩家 1'],
    duelPlayer2: ['Игрок 2', 'Player 2', '玩家 2'],
    duelYou: ['Ты', 'You', '你'],
    duelDrop: ['Перетащи друга', 'Drop a friend', '拖入好友'],
    duelNeedTwo: ['Заполни оба слота, чтобы начать баттл.', 'Fill both slots to start the battle.', '填满两个槽位即可开始对战。'],
    compat: ['совместимость', 'chemistry', '契合度'],
    sharedGames: ['{n} общих игр', '{n} shared games', '{n} 款共同游戏'],

    feedLabel: ['Steam · новости и скидки', 'Steam · news & deals', 'Steam · 新闻与折扣'],
    feedEmpty: ['Свежие новости и скидки Steam появятся здесь.', 'Fresh Steam news and deals will appear here.', '最新的 Steam 新闻与折扣会出现在这里。'],
    feedDeal: ['скидка', 'deal', '折扣'],
    feedNews: ['новость', 'news', '新闻'],
    feedGame: ['игра', 'game', '游戏'],
    feedFree: ['бесплатно', 'free', '免费'],
    feedAll: ['Все новости', 'All news', '全部新闻'],
    feedCollapse: ['Свернуть ленту', 'Collapse the feed', '收起新闻栏'],
    feedExpand: ['Развернуть ленту', 'Expand the feed', '展开新闻栏'],

    navOverview: ['Обзор', 'Overview', '概览'],
    navPassport: ['Паспорт', 'Passport', '护照'],
    navGames: ['Игры', 'Games', '游戏'],
    navInventory: ['Инвентарь', 'Inventory', '库存'],
    navTrophies: ['Трофеи', 'Trophies', '成就'],
    navTracker: ['Трекер онлайна', 'Online tracker', '在线追踪'],
    navFriends: ['Друзья', 'Friends', '好友'],

    localTime: ['Местное время: {tz} ({off})', 'Local time: {tz} ({off})', '本地时间：{tz} ({off})'],

    passportTitle: ['Digital Passport', 'Digital Passport', '数字护照'],
    passportSub: ['Коллекционная карточка профиля. Скачай PNG или вставь BB-код в витрину Steam.',
      'A collectible profile card. Download the PNG or paste the BB code into a Steam showcase.',
      '可收藏的档案卡。下载 PNG，或把 BB 代码贴进 Steam 展柜。'],
    passportSerial: ['Серийный номер', 'Serial', '序列号'],
    passportIssued: ['Выдан', 'Issued', '签发'],
    passportCode: ['КОД КАРТОЧКИ', 'CARD CODE', '卡片代码'],
    profileId: ['ID ПРОФИЛЯ', 'PROFILE ID', '档案 ID'],
    favoriteGenre: ['Любимый жанр', 'Favourite genre', '最爱的类型'],
    passportScan: ['Подлинность подтверждается кодом карточки', 'Authenticity confirmed by the card code', '以卡片代码验证真伪'],
    passportFree: ['Коллекционный экземпляр · не для продажи', 'Collectible copy · not for sale', '收藏版本 · 非卖品'],
    passportBB: ['BB-код для витрины', 'BB code for your showcase', '展柜 BB 代码'],

    presencePlaying: ['Сейчас играет: {game}', 'Playing {game}', '正在玩 {game}'],
    presenceJoin: ['Подключиться', 'Join', '加入'],
    presenceOnline: ['В сети', 'Online', '在线'],
    presenceBusy: ['Не беспокоить', 'Do not disturb', '请勿打扰'],
    presenceAway: ['Отошёл', 'Away', '离开'],
    presenceOffline: ['Не в сети', 'Offline', '离线'],
    presenceHidden: ['Статус скрыт', 'Status hidden', '状态未公开'],
    presenceLastSeen: ['был в сети {time}', 'last online {time}', '上次在线 {time}'],
    presenceNow: ['только что', 'just now', '刚刚'],

    toastSteamDown: ['Steam не ответил — попробуй через минуту.', 'Steam did not answer — try again in a minute.', 'Steam 无响应 —— 请稍后再试。'],
    toastNoProfile: ['Сначала проверь профиль', 'Analyze a profile first', '请先分析一个档案'],

    noData: ['Нет данных', 'No data', '无数据'],
    gamesWord: ['игр', 'games', '款游戏'],
    ofLibrary: ['библиотеки', 'of the library', '的游戏库'],
    today: ['сегодня', 'today', '今天'],
    playersShare: ['игроков', 'of players', '的玩家'],
    free: ['Бесплатно', 'Free', '免费'],
    itemsWord: ['предметов', 'items', '件'],
    sinceWord: ['в Steam с', 'on Steam since', '加入 Steam 于'],
    genresWord: ['жанров', 'genres', '个类型'],
    bestOf: ['Лучшее', 'Best', '最佳']
  };

  var I18N = { ru: {}, en: {}, zh: {} };
  Object.keys(STRINGS).forEach(function (k) {
    I18N.ru[k] = STRINGS[k][0];
    I18N.en[k] = STRINGS[k][1];
    I18N.zh[k] = STRINGS[k][2];
  });

  var LOCALES = { ru: 'ru-RU', en: 'en-US', zh: 'zh-CN' };

  /* Last-resort label for a missing key: turn `navOverview` into
     “Overview” instead of ever leaking the raw technical key to the UI. */
  function humanizeKey(key) {
    var raw = String(key == null ? '' : key);
    raw = raw.replace(/^nav[A-Z]/, function (m) { return m.charAt(3); });
    var spaced = raw
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .trim();
    if (!spaced) return '';
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  function t(key, vars) {
    var s = (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || humanizeKey(key);
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
      });
    }
    return s;
  }

  /* ------------------------------------------------------------------ *
   * 2. money / numbers
   * ------------------------------------------------------------------ */

  var FX = { RUB: 92.4, USD: 1, CNY: 7.16 };
  var CUR = {
    RUB: { sym: '₽', pos: 'post' },
    USD: { sym: '$', pos: 'pre' },
    CNY: { sym: '¥', pos: 'pre' }
  };

  function nf(min, max) {
    try {
      return new Intl.NumberFormat(LOCALES[state.lang], { minimumFractionDigits: min, maximumFractionDigits: max });
    } catch (e) {
      return new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
    }
  }

  function money(usd, opts) {
    opts = opts || {};
    var cur = opts.currency || state.cur;
    var v = (Number(usd) || 0) * FX[cur];
    var digits;
    if (opts.digits != null) digits = opts.digits;
    else if (cur === 'USD') digits = Math.abs(v) < 100 ? 2 : 0;
    else digits = 0;
    var body = nf(digits, digits).format(v);
    var c = CUR[cur];
    return c.pos === 'pre' ? c.sym + body : body + ' ' + c.sym;
  }

  function num(v, d) {
    var digits = d == null ? 0 : d;
    return nf(digits, digits).format(Number(v) || 0);
  }

  function compact(v) {
    var n = Number(v) || 0;
    if (Math.abs(n) >= 1000000) return round(n / 1000000, 1) + 'M';
    if (Math.abs(n) >= 10000) return round(n / 1000, 1) + 'K';
    if (Math.abs(n) >= 1000) return nf(0, 1).format(n);
    return nf(0, 0).format(n);
  }

  function hoursLabel(h, short) {
    if (short) return num(Math.round(h)) + ' ' + t('hoursShort');
    return num(Math.round(h)) + ' ' + t('hoursShort');
  }

  function dateStr(ts) {
    try {
      return new Intl.DateTimeFormat(LOCALES[state.lang], { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ts));
    } catch (e) { return '—'; }
  }

  function relTime(ts) {
    var diff = Date.now() - ts;
    var d = Math.floor(diff / 86400000);
    if (d <= 0) return t('today');
    if (d < 30) return d + 'd';
    if (d < 365) return Math.floor(d / 30) + 'mo';
    return Math.floor(d / 365) + 'y';
  }

  function timeAgo(ts) {
    var diff = Date.now() - (Number(ts) || 0);
    if (!ts || diff < 0) return t('presenceNow');
    var mins = Math.floor(diff / 60000);
    if (mins < 2) return t('presenceNow');
    var R = window.Intl && Intl.RelativeTimeFormat
      ? new Intl.RelativeTimeFormat(LOCALES[state.lang], { numeric: 'auto' })
      : null;
    function fmt(v, unit, fallback) {
      if (R) {
        try { return R.format(-v, unit); } catch (e) { /* fall through */ }
      }
      return fallback;
    }
    if (mins < 60) return fmt(Math.round(mins), 'minute', Math.round(mins) + 'm');
    var hours = Math.floor(mins / 60);
    if (hours < 24) return fmt(hours, 'hour', hours + 'h');
    var days = Math.floor(hours / 24);
    if (days < 31) return fmt(days, 'day', days + 'd');
    var months = Math.floor(days / 30);
    if (months < 12) return fmt(months, 'month', months + 'mo');
    return fmt(Math.floor(days / 365), 'year', Math.floor(days / 365) + 'y');
  }

  function proxied(url) {
    if (!url) return '';
    var host = '';
    try { host = new URL(url).hostname; } catch (e) { return url; }
    if (API_BASE && /(^|\.)steamstatic\.com$|(^|\.)steamcdn-a\.akamaihd\.net$|(^|\.)steamcommunity-a\.akamaihd\.net$/i.test(host)) {
      return API_BASE + '/avatar-proxy?url=' + encodeURIComponent(url);
    }
    return url;
  }

  /* ------------------------------------------------------------------ *
   * 3. state
   * ------------------------------------------------------------------ */

  var state = {
    lang: store('sk_lang') || 'ru',
    cur: store('sk_cur') || 'RUB',
    view: 'overview',
    filter: 'all',
    query: '',
    year: null,
    history: store('sk_history') || [],
    model: null,
    raw: null,
    source: 'none',
    pickIndex: 0,
    compare: null,
    duel: { a: null, b: null },
    feedGame: '',
    feedCollapsed: store('sk_feed_collapsed') === '1',
    dragFriend: '',
    dragPersona: '',
    dragAvatar: '',
    lastQuery: ''
  };

  if (!Array.isArray(state.history)) state.history = [];

  function persist() {
    store('sk_lang', state.lang);
    store('sk_cur', state.cur);
    store('sk_history', state.history);
  }

  /* ------------------------------------------------------------------ *
   * 4. normalisation
   * ------------------------------------------------------------------ */

  var TAGS = { never: 1, coop: 1, short: 1, gem: 1, delisted: 1, long: 1, hard: 1, multi: 1, software: 1 };

  function normaliseGame(row) {
    var tags = (row[13] || '').split(',').filter(Boolean);
    var tagSet = {};
    tags.forEach(function (tg) { tagSet[tg] = true; });
    var price = Number(row[6]) || 0;
    var disc = Number(row[7]) || 0;
    return {
      appid: row[0],
      name: row[1],
      hours: Number(row[2]) || 0,
      hours2w: Number(row[3]) || 0,
      genres: String(row[4] || '').split(',').filter(Boolean),
      metacritic: Number(row[5]) || 0,
      price: price,
      discount: disc,
      salePrice: round(price * (1 - disc / 100), 2),
      year: Number(row[8]) || 0,
      ach: { unlocked: Number(row[9]) || 0, total: Number(row[10]) || 0 },
      lastYear: Number(row[11]) || 0,
      weight: Number(row[12]) || 1,
      tags: tagSet,
      software: !!row[15] || !!tagSet.software,
      delisted: !!row[14] || !!tagSet.delisted,
      cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/' + row[0] + '/header.jpg',
      accent: accentFor(row[0])
    };
  }

  var ACCENTS = ['#7C5CFF', '#55E6C8', '#F5B544', '#FF6B7A', '#4EA8FF', '#C084FC', '#34D399', '#FB923C'];

  function accentFor(seed) {
    return ACCENTS[hash31(String(seed)) % ACCENTS.length];
  }

  function normaliseLiveGame(g) {
    var tags = g.tags || {};
    if (Array.isArray(tags)) {
      var tmp = {};
      tags.forEach(function (x) { tmp[x] = true; });
      tags = tmp;
    }
    var price = Number(g.price) || 0;
    var disc = Number(g.discount) || 0;
    var hours = g.hours != null ? Number(g.hours) : (Number(g.playtime_forever) || 0) / 60;
    var ach = g.ach || { unlocked: g.ach_unlocked || 0, total: g.ach_total || 0 };
    return {
      appid: g.appid,
      name: g.name || ('App ' + g.appid),
      hours: hours,
      hours2w: Number(g.hours2w || 0),
      genres: g.genres || [],
      metacritic: Number(g.metacritic) || 0,
      price: price,
      discount: disc,
      salePrice: g.salePrice != null ? Number(g.salePrice) : round(price * (1 - disc / 100), 2),
      year: Number(g.year) || 0,
      ach: { unlocked: Number(ach.unlocked) || 0, total: Number(ach.total) || 0 },
      lastYear: Number(g.lastYear) || 0,
      weight: Number(g.weight) || 2,
      tags: tags,
      software: !!g.software || !!tags.software,
      delisted: !!g.delisted,
      cover: g.cover || ('https://cdn.cloudflare.steamstatic.com/steam/apps/' + g.appid + '/header.jpg'),
      accent: g.accent || accentFor(g.appid)
    };
  }

  function hydrate(data) {
    var games = (data.games || []).map(function (g) {
      return Array.isArray(g) ? normaliseGame(g) : normaliseLiveGame(g);
    });
    return {
      source: data.source || 'live',
      profile: data.profile || {},
      games: games,
      inventory: data.inventory || [],
      inventoryHidden: !!data.inventory_hidden,
      inventoryTotal: Number(data.inventory_total) || 0,
      achievements: data.achievements || {},
      yearly: data.yearly || [],
      hourly: data.hourly || null,
      friends: data.friends || [],
      warnings: data.warnings || []
    };
  }

  /* ------------------------------------------------------------------ *
   * 5. analytics — one engine for the live payload
   * ------------------------------------------------------------------ */

  var GENRE_I18N = {
    Action: ['Экшн', 'Action', '动作'],
    RPG: ['РПГ', 'RPG', '角色扮演'],
    Strategy: ['Стратегия', 'Strategy', '策略'],
    Indie: ['Инди', 'Indie', '独立'],
    Adventure: ['Приключения', 'Adventure', '冒险'],
    Simulation: ['Симулятор', 'Simulation', '模拟'],
    Sports: ['Спорт', 'Sports', '体育'],
    Racing: ['Гонки', 'Racing', '竞速'],
    FPS: ['Шутер', 'FPS', '射击'],
    Platformer: ['Платформер', 'Platformer', '平台跳跃'],
    Puzzle: ['Головоломка', 'Puzzle', '解谜'],
    Survival: ['Выживание', 'Survival', '生存'],
    Horror: ['Хоррор', 'Horror', '恐怖'],
    Coop: ['Кооператив', 'Co-op', '合作'],
    Roguelike: ['Рогалик', 'Roguelike', 'Roguelike'],
    Multiplayer: ['Мультиплеер', 'Multiplayer', '多人']
  };

  function genreName(g) {
    var row = GENRE_I18N[g];
    if (!row) return g;
    return state.lang === 'ru' ? row[0] : state.lang === 'zh' ? row[2] : row[1];
  }

  /* ---- local-time helpers for the online tracker -------------------------
   * Activity is stored in server (UTC) hours; every visitor should see it in
   * their own timezone, so the 24-hour profile is rotated by their offset. */

  function localOffsetMinutes() {
    return -new Date().getTimezoneOffset(); /* minutes east of UTC, e.g. +300 */
  }

  function localZoneLabel() {
    var off = localOffsetMinutes();
    var abs = Math.abs(off);
    var hh = Math.floor(abs / 60);
    var mm = abs % 60;
    var offset = 'UTC' + (off >= 0 ? '+' : '-') + hh + (mm ? ':' + ('0' + mm).slice(-2) : '');
    var name = '';
    try { name = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { name = ''; }
    return { name: name, offset: offset };
  }

  function shiftHoursUTC(arr, offsetMinutes) {
    var shift = (offsetMinutes || 0) / 60;
    var out = [];
    for (var i = 0; i < 24; i++) out.push(0);
    for (var h = 0; h < 24; h++) {
      var target = (((h + shift) % 24) + 24) % 24;
      var lo = Math.floor(target);
      var hi = (lo + 1) % 24;
      var frac = target - lo;
      out[lo] += arr[h] * (1 - frac);
      if (frac > 0.0001) out[hi] += arr[h] * frac;
    }
    return out;
  }

  function buildModel(raw) {
    var games = raw.games.slice();
    var profile = raw.profile || {};
    var seed = hash31(String(profile.steamid || profile.persona || 'steam'));

    var totalGames = games.length;
    var hours = sum(games, function (g) { return g.hours; });
    var played = games.filter(function (g) { return g.hours > 0.5; });
    var never = games.filter(function (g) { return g.hours <= 0.5; });

    var fullValue = round(sum(games, function (g) { return g.price; }), 2);
    var saleValue = round(sum(games, function (g) { return g.salePrice; }), 2);
    var priced = games.filter(function (g) { return g.salePrice > 0; });
    var priciest = priced.slice().sort(function (a, b) {
      return b.salePrice - a.salePrice || b.price - a.price;
    })[0] || null;
    var avgPrice = priced.length ? round(sum(priced, function (g) { return g.salePrice; }) / priced.length, 2) : 0;

    var inventory = (raw.inventory || []).filter(function (i) {
      return Number(i.price) > 0;
    }).slice().sort(function (a, b) { return b.price - a.price; });
    var invValue = round(sum(inventory, function (i) {
      return i.price * Math.max(1, Number(i.count) || 1);
    }), 2);
    var portfolio = round(saleValue + invValue, 2);

    /* genres by hours — utilities are not games, so they don't shape taste */
    var genreMap = {};
    games.forEach(function (g) {
      if (g.software) return;
      var w = Math.max(g.hours, 0.6 * g.weight);
      g.genres.forEach(function (name) {
        if (!genreMap[name]) genreMap[name] = { name: name, hours: 0, count: 0 };
        genreMap[name].hours += w;
        genreMap[name].count += 1;
      });
    });
    var genres = Object.keys(genreMap).map(function (k) { return genreMap[k]; })
      .sort(function (a, b) { return b.hours - a.hours; });
    var genreTotal = sum(genres, function (g) { return g.hours; }) || 1;
    genres.forEach(function (g) { g.share = g.hours / genreTotal; });
    var topGenre = genres[0] || { name: '—', share: 0, hours: 0, count: 0 };
    var top3Share = sum(genres.slice(0, 3), function (g) { return g.share; });

    /* quality */
    var rated = games.filter(function (g) { return g.metacritic > 0; });
    var avgMc = rated.length ? sum(rated, function (g) { return g.metacritic; }) / rated.length : 0;
    var bestGame = rated.slice().sort(function (a, b) { return b.metacritic - a.metacritic || b.hours - a.hours; })[0];

    /* anti-hype */
    var recentGems = 0, olderGems = 0;
    played.forEach(function (g) {
      if (g.metacritic >= 84 && g.year >= 2020) recentGems += g.hours;
      if (g.metacritic >= 84 && g.year > 0 && g.year <= 2018) olderGems += g.hours;
    });
    var trendShare = hours ? recentGems / hours : 0;
    var antiHype = clamp(Math.round(100 - trendShare * 78 + (olderGems / (hours || 1)) * 34), 4, 98);
    var hypeLabel = antiHype >= 62 ? 'hypeHidden' : antiHype >= 38 ? 'hypeBalanced' : 'hypeTrend';

    /* rhythm — activity arrives in server (UTC) hours, so shift it to the
       visitor's own timezone before anything is computed from it */
    var baseHourly = raw.hourly && raw.hourly.length === 24 ? raw.hourly.slice() : makeRhythm(profile.steamid, hours, seed);
    var hourly = shiftHoursUTC(baseHourly, localOffsetMinutes());
    var peakHour = hourly.indexOf(Math.max.apply(null, hourly));
    var nightShare = sum([22, 23, 0, 1, 2, 3].map(function (h) { return hourly[h]; })) / (sum(hourly) || 1);
    var rhythmLabel = (peakHour >= 21 || peakHour <= 4) ? 'nightOwl'
      : (peakHour >= 9 && peakHour <= 17) ? 'dayTact' : 'evening';
    var peakShare = Math.round((hourly[peakHour] / (sum(hourly) || 1)) * 100);

    /* account */
    var bans = profile.bans || null;
    var banCount = bans ? (Number(bans.vac) || 0) + (Number(bans.game) || 0) +
      (Number(bans.trade) || 0) + (Number(bans.community) || 0) : 0;

    /* achievements */
    var achTotal = sum(games, function (g) { return g.ach.total; });
    var achUnlocked = sum(games, function (g) { return g.ach.unlocked; });
    var achRatio = achTotal ? achUnlocked / achTotal : 0;
    var closest = games.filter(function (g) {
      if (!g.ach.total) return false;
      var r = g.ach.unlocked / g.ach.total;
      return r >= 0.85 && r < 1;
    }).sort(function (a, b) {
      return (b.ach.unlocked / b.ach.total) - (a.ach.unlocked / a.ach.total);
    }).slice(0, 4);
    var achDone = games.filter(function (g) { return g.ach.total > 0 && g.ach.unlocked >= g.ach.total; });

    /* backlog — value counts only games that were never launched */
    function estLength(g) {
      if (g.tags.short) return 9;
      if (g.tags.long) return 48;
      return 22;
    }
    var backlogHours = sum(never, estLength);
    var backlogValue = sum(never, function (g) { return g.salePrice; });
    var backlogDays = Math.ceil(backlogHours / 2);

    /* years */
    var yearly = (raw.yearly || []).slice().sort(function (a, b) { return a.y - b.y; });
    if (!yearly.length && games.length) {
      var ymap = {};
      games.forEach(function (g) {
        if (!g.lastYear || !g.hours) return;
        if (!ymap[g.lastYear]) ymap[g.lastYear] = { y: g.lastYear, h: 0, g: 0 };
        ymap[g.lastYear].h += g.hours;
        ymap[g.lastYear].g += 1;
      });
      yearly = Object.keys(ymap).map(function (k) { return ymap[k]; }).sort(function (a, b) { return a.y - b.y; });
    }
    if (!yearly.length) yearly = [{ y: new Date().getFullYear(), h: hours, g: totalGames }];

    /* friends */
    var friends = (raw.friends || []).map(function (f) {
      var shared = f.shared || [];
      var compat = f.compat != null ? f.compat
        : clamp(Math.round(38 + shared.length * 12.5 + (hash31(f.steamid || f.persona) % 13)), 32, 99);
      return {
        steamid: f.steamid,
        persona: f.persona,
        avatar: f.avatar || '',
        hours: f.hours || 0,
        shared: shared,
        compat: compat
      };
    }).sort(function (a, b) { return b.compat - a.compat; });

    var playable = played.filter(function (g) { return !g.software; });
    var top3Games = (playable.length ? playable : played)
      .slice().sort(function (a, b) { return b.hours - a.hours; }).slice(0, 3);
    var freeCount = games.filter(function (g) { return !g.price; }).length;
    var paidCount = totalGames - freeCount;
    var createdYear = profile.created ? new Date(profile.created).getFullYear() : 0;
    var accountAge = profile.created ? Math.max(0, Math.floor((Date.now() - profile.created) / (365.25 * 86400000))) : 0;
    var unplayedShare = totalGames ? never.length / totalGames : 0;
    var coopPlayed = played.filter(function (g) { return g.tags.coop || g.genres.indexOf('Coop') >= 0; });
    var coopShare = played.length ? coopPlayed.length / played.length : 0;
    var softwareCount = games.filter(function (g) { return g.software; }).length;

    var model = {
      source: raw.source || 'live',
      profile: profile,
      games: games,
      inventory: inventory,
      genres: genres,
      topGenre: topGenre,
      top3Share: top3Share,
      friends: friends,
      yearly: yearly,
      hourly: hourly,
      tz: localZoneLabel(),
      peakHour: peakHour,
      peakShare: peakShare,
      nightShare: nightShare,
      rhythmLabel: rhythmLabel,
      top3Games: top3Games,
      achievements: {
        total: achTotal,
        unlocked: achUnlocked,
        ratio: achRatio,
        closest: closest,
        done: achDone,
        rarest: (raw.achievements && raw.achievements.rarest) || [],
        first: (raw.achievements && raw.achievements.first) || null
      },
      totals: {
        games: totalGames,
        played: played.length,
        never: never.length,
        hours: hours,
        days: Math.round((hours / 24) * 10) / 10,
        avgHours: played.length ? hours / played.length : 0,
        achievements: achUnlocked,
        free: freeCount,
        paid: paidCount,
        software: softwareCount
      },
      money: {
        full: fullValue,
        sale: saleValue,
        savings: Math.max(0, fullValue - saleValue),
        savingsPct: fullValue ? Math.round(((fullValue - saleValue) / fullValue) * 100) : 0,
        inventory: invValue,
        portfolio: portfolio,
        costPerHour: hours > 0.5 ? saleValue / hours : 0,
        backlogValue: backlogValue
      },
      library: {
        value: saleValue,
        priciest: priciest,
        priced: priced.length,
        avgPrice: avgPrice,
        costPerHour: hours > 0.5 ? saleValue / hours : 0
      },
      inventoryHidden: !!raw.inventoryHidden,
      inventoryTotal: Number(raw.inventoryTotal) || inventory.length,
      backlog: {
        hours: backlogHours,
        days: backlogDays,
        games: never.length,
        value: backlogValue
      },
      quality: {
        avgMc: round(avgMc, 1),
        index: round(avgMc / 10, 1),
        rated: rated.length,
        best: bestGame || null,
        antiHype: antiHype,
        hypeLabel: hypeLabel,
        trendShare: round(trendShare * 100, 0)
      },
      account: {
        known: !!bans,
        bans: banCount,
        vac: bans ? Number(bans.vac) || 0 : 0,
        game: bans ? Number(bans.game) || 0 : 0,
        trade: bans ? Number(bans.trade) || 0 : 0,
        community: bans ? Number(bans.community) || 0 : 0,
        lastBanDays: bans ? Number(bans.lastBanDays) || 0 : 0,
        clean: !!bans && banCount === 0,
        label: banCount === 0 ? 'cleanOk' : 'cleanWarn'
      },
      persona: {
        accountAge: accountAge,
        createdYear: createdYear,
        unplayedShare: unplayedShare,
        coopShare: coopShare,
        nightShare: nightShare
      }
    };

    return model;
  }

  function makeRhythm(seedText, hours, seed) {
    var rngState = (seed >>> 0) || 1;
    function next() {
      rngState ^= rngState << 13; rngState >>>= 0;
      rngState ^= rngState >> 17;
      rngState ^= rngState << 5; rngState >>>= 0;
      return (rngState >>> 0) / 4294967296;
    }
    var center = 15 + Math.floor(next() * 10);
    var out = [];
    for (var h = 0; h < 24; h++) {
      var dist = Math.min(Math.abs(h - center), 24 - Math.abs(h - center));
      var base = Math.exp(-(dist * dist) / 17);
      var wobble = 0.55 + next() * 0.9;
      out.push(Math.max(0.04, base * wobble));
    }
    var s = sum(out) || 1;
    return out.map(function (v) { return round((v / s) * (hours || 100), 1); });
  }

  /* ------------------------------------------------------------------ *
   * 6. the curator — a varied, specific portrait per profile
   * ------------------------------------------------------------------ */

  function joinList(items) {
    var list = items.filter(Boolean);
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    var last = list.pop();
    var glue = state.lang === 'ru' ? ' и ' : state.lang === 'zh' ? '与' : ' and ';
    var sep = state.lang === 'zh' ? '、' : ', ';
    return list.join(sep) + glue + last;
  }

  function gameQuote(name) {
    if (state.lang === 'zh') return '《' + name + '》';
    if (state.lang === 'en') return '\u201c' + name + '\u201d';
    return '«' + name + '»';
  }

  function portraitParagraphs(m) {
    var p = m.profile;
    var name = p.persona || 'Steam';
    var top = m.top3Games;
    var genres = m.genres.slice(0, 3);
    var rarest = m.achievements.rarest[0] || null;
    var age = m.persona.accountAge;
    var createdYear = m.persona.createdYear;
    var freePct = m.totals.games ? Math.round((m.totals.free / m.totals.games) * 100) : 0;
    var unplayedPct = Math.round(m.persona.unplayedShare * 100);
    var style = playStyle(m);
    var topGenre = topGenreName(m);

    if (state.lang === 'ru') {
      var a1 = age >= 1
        ? name + ' в Steam уже ' + age + ' ' + yearsWord(age) + ': ' + num(m.totals.games) + ' игр и ' + num(m.totals.hours) + ' часов за всё время.'
        : name + ' появился в Steam относительно недавно, но уже собрал ' + num(m.totals.games) + ' игр и ' + num(m.totals.hours) + ' часов.';
      var a2 = topGenre
        ? ' Главная полка — ' + topGenre + ': ' + Math.round(m.topGenre.share * 100) + '% всего времени.'
        : '';
      var b1 = top.length
        ? ' По часам впереди ' + joinList(top.map(function (g) {
          return gameQuote(g.name) + ' (' + num(Math.round(g.hours)) + ' ' + t('hoursShort') + ')';
        })) + '.'
        : '';
      var b2 = genres.length
        ? ' Любимые жанры — ' + joinList(genres.map(function (g) { return genreName(g.name); })) + '.'
        : '';
      var b3 = ' В библиотеке бесплатных игр — ' + num(m.totals.free) + ' (' + freePct + '%), платных — ' +
        num(m.totals.paid) + '.';
      var c1 = m.backlog.games
        ? ' ' + num(m.backlog.games) + ' игр (' + unplayedPct + '%) ещё ни разу не запускались: это примерно ' +
          num(Math.round(m.backlog.hours)) + ' часов запаса и ' + money(m.backlog.value) + ' нетронутой стоимости.'
        : ' Похоже, у тебя нет нетронутых игр — редкая дисциплина для Steam.';
      var c2 = rarest
        ? ' Самый редкий трофей — ' + gameQuote(rarest.name) + ' из ' + gameQuote(rarest.game) +
          ', его получили ' + fmtRarity(rarest.rarity) + '% игроков.'
        : '';
      var c3 = ' ' + style;
      return [a1 + a2, b1 + b2 + b3, c1 + c2 + c3];
    }

    if (state.lang === 'zh') {
      var z1 = age >= 1
        ? name + ' 加入 Steam 已经 ' + age + ' 年：' + num(m.totals.games) + ' 款游戏、' + num(m.totals.hours) + ' 小时的时光。'
        : name + ' 来到 Steam 不久，却已经攒下 ' + num(m.totals.games) + ' 款游戏和 ' + num(m.totals.hours) + ' 小时。';
      var z2 = topGenre
        ? ' 最主要的货架是' + topGenre + '，占全部时间的 ' + Math.round(m.topGenre.share * 100) + '%。'
        : '';
      var z3 = top.length
        ? ' 按时长排在前三的是 ' + joinList(top.map(function (g) {
          return gameQuote(g.name) + '（' + num(Math.round(g.hours)) + ' ' + t('hoursShort') + '）';
        })) + '。'
        : '';
      var z4 = genres.length
        ? ' 最爱的类型是' + joinList(genres.map(function (g) { return genreName(g.name); })) + '。'
        : '';
      var z5 = ' 库里有 ' + num(m.totals.free) + ' 款免费游戏（' + freePct + '%）和 ' + num(m.totals.paid) + ' 款付费游戏。';
      var z6 = m.backlog.games
        ? ' 还有 ' + num(m.backlog.games) + ' 款（' + unplayedPct + '%）从未启动：大约 ' + num(Math.round(m.backlog.hours)) +
          ' 小时的储备，价值 ' + money(m.backlog.value) + '。'
        : ' 你居然没有从未启动的游戏——在 Steam 上相当自律。';
      var z7 = rarest
        ? ' 最稀有的成就是' + gameQuote(rarest.name) + '（' + rarest.game + '），只有 ' + fmtRarity(rarest.rarity) + '% 的玩家拿到。'
        : '';
      return [z1 + z2, z3 + z4 + z5, z6 + z7 + ' ' + style];
    }

    var e1 = age >= 1
      ? name + ' has been on Steam for ' + age + ' ' + yearsWord(age) + ': ' + num(m.totals.games) + ' games and ' + num(m.totals.hours) + ' hours so far.'
      : name + ' joined Steam recently, yet already owns ' + num(m.totals.games) + ' games and ' + num(m.totals.hours) + ' hours.';
    var e2 = topGenre
      ? ' The main shelf is ' + topGenre + ', holding ' + Math.round(m.topGenre.share * 100) + '% of all playtime.'
      : '';
    var e3 = top.length
      ? ' By hours the lead is ' + joinList(top.map(function (g) {
        return gameQuote(g.name) + ' (' + num(Math.round(g.hours)) + ' ' + t('hoursShort') + ')';
      })) + '.'
      : '';
    var e4 = genres.length
      ? ' Favourite genres: ' + joinList(genres.map(function (g) { return genreName(g.name); })) + '.'
      : '';
    var e5 = ' The library holds ' + num(m.totals.free) + ' free titles (' + freePct + '%) and ' +
      num(m.totals.paid) + ' paid ones.';
    var e6 = m.backlog.games
      ? ' ' + num(m.backlog.games) + ' games (' + unplayedPct + '%) have never been launched: about ' +
        num(Math.round(m.backlog.hours)) + ' hours of reserve and ' + money(m.backlog.value) + ' untouched value.'
      : ' Apparently you have no untouched games — rare discipline for Steam.';
    var e7 = rarest
      ? ' The rarest trophy is ' + gameQuote(rarest.name) + ' from ' + gameQuote(rarest.game) +
        ', unlocked by ' + fmtRarity(rarest.rarity) + '% of players.'
      : '';
    return [e1 + e2, e3 + e4 + e5, e6 + e7 + ' ' + style];
  }

  function yearsWord(n) {
    if (state.lang === 'zh') return '年';
    if (state.lang === 'en') return n === 1 ? 'year' : 'years';
    var mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'год';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'года';
    return 'лет';
  }

  function daysWord(n) {
    if (state.lang === 'zh') return '天';
    if (state.lang === 'en') return n === 1 ? 'day' : 'days';
    var mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'день';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
    return 'дней';
  }

  function fmtRarity(r) {
    if (r == null) return '—';
    return Number(r) < 1 ? Number(r).toFixed(1) : String(Math.round(Number(r)));
  }

  function topGenreName(m) {
    if (!m.genres.length) return '';
    return genreName(m.genres[0].name);
  }

  function playStyle(m) {
    var night = m.persona.nightShare > 0.4;
    var coop = m.persona.coopShare > 0.32;
    var genre = m.topGenre.name;
    if (state.lang === 'ru') {
      if (genre === 'RPG' || genre === 'Adventure') {
        return night
          ? 'Стиль игры — длинные вечерние сессии с историей, чаще всего после полуночи.'
          : 'Стиль игры — вдумчивое прохождение с историей, без спешки и без гонки за релизами.';
      }
      if (genre === 'FPS' || genre === 'Action') {
        return coop
          ? 'Стиль игры — быстрые матчи в компании: библиотека явно заточена под игру вместе.'
          : 'Стиль игры — короткие интенсивные заходы, где важен темп, а не размер мира.';
      }
      if (genre === 'Strategy' || genre === 'Simulation') {
        return 'Стиль игры — длинные партии и планирование: здесь ценится система, а не сюжетный поворот.';
      }
      if (genre === 'Indie') {
        return 'Стиль игры — небольшие авторские проекты: ты ищешь идею, а не графику.';
      }
      return coop
        ? 'Стиль игры — кооператив и общие вечера: одному играть явно скучнее.'
        : 'Стиль игры — спокойное исследование без спешки, с уважением к собственному темпу.';
    }
    if (state.lang === 'zh') {
      if (genre === 'RPG' || genre === 'Adventure') {
        return night ? '你的节奏是深夜里的长篇叙事，越晚越投入。' : '你的节奏是慢慢推进剧情，不追首发，也不赶进度。';
      }
      if (genre === 'FPS' || genre === 'Action') {
        return coop ? '你的节奏是和朋友一起的快速对局，库里的游戏明显为组队而生。' : '你的节奏是短促而高强度的对局，重节奏胜过大地图。';
      }
      if (genre === 'Strategy' || genre === 'Simulation') {
        return '你的节奏是长局与规划，看重系统而不是剧情转折。';
      }
      if (genre === 'Indie') {
        return '你的节奏偏向小型作者作品，你找的是点子，不是画面。';
      }
      return coop ? '你的节奏是合作与共同度过的夜晚，一个人玩显然更无聊。' : '你的节奏是不慌不忙的探索，尊重自己的速度。';
    }
    if (genre === 'RPG' || genre === 'Adventure') {
      return night
        ? 'Your style is long evening story sessions, most often after midnight.'
        : 'Your style is unhurried story playthroughs — no rush, no release-day race.';
    }
    if (genre === 'FPS' || genre === 'Action') {
      return coop
        ? 'Your style is fast matches with friends: the library is clearly built for playing together.'
        : 'Your style is short, intense sessions where pace matters more than map size.';
    }
    if (genre === 'Strategy' || genre === 'Simulation') {
      return 'Your style is long campaigns and planning: systems matter more than plot twists.';
    }
    if (genre === 'Indie') {
      return 'Your style leans to small authored projects: you look for an idea, not for graphics.';
    }
    return coop
      ? 'Your style is co-op and shared evenings: playing alone clearly feels duller.'
      : 'Your style is calm exploration at your own pace, with respect for your own tempo.';
  }

  /* ------------------------------------------------------------------ *
   * 7. compare helpers
   * ------------------------------------------------------------------ */

  function duelRows(a, b) {
    var ageA = (a.persona && a.persona.accountAge) || 0;
    var ageB = (b.persona && b.persona.accountAge) || 0;
    var lvlA = (a.profile && a.profile.level) || 0;
    var lvlB = (b.profile && b.profile.level) || 0;
    return [
      { label: 'metricHours', a: a.totals.hours, b: b.totals.hours, fmt: 'hours' },
      { label: 'metricGames', a: a.totals.games, b: b.totals.games, fmt: 'int' },
      { label: 'metricValue', a: a.money.portfolio, b: b.money.portfolio, fmt: 'money' },
      { label: 'metricInventory', a: a.money.inventory, b: b.money.inventory, fmt: 'money' },
      { label: 'metricAch', a: a.achievements.unlocked, b: b.achievements.unlocked, fmt: 'int' },
      { label: 'metricAchRatio', a: a.achievements.ratio * 100, b: b.achievements.ratio * 100, fmt: 'percent' },
      { label: 'metricQuality', a: a.quality.avgMc, b: b.quality.avgMc, fmt: 'float1' },
      { label: 'metricAvgHours', a: a.totals.avgHours, b: b.totals.avgHours, fmt: 'hours' },
      { label: 'metricPerfect', a: a.achievements.done.length, b: b.achievements.done.length, fmt: 'int' },
      { label: 'metricLevel', a: lvlA, b: lvlB, fmt: 'int' },
      { label: 'metricAge', a: ageA, b: ageB, fmt: 'int' },
      { label: 'metricFriends', a: a.friends.length, b: b.friends.length, fmt: 'int' }
    ];
  }

  /* ------------------------------------------------------------------ *
   * 8. render primitives
   * ------------------------------------------------------------------ */

  function fmtBy(kind, v) {
    if (kind === 'money') return money(v, { digits: Math.abs(v) < 100 ? 2 : 0 });
    if (kind === 'money1') return money(v, { digits: 1 });
    if (kind === 'percent') return nf(1, 1).format(v) + '%';
    if (kind === 'float1') return nf(1, 1).format(v);
    if (kind === 'float2') return nf(2, 2).format(v);
    if (kind === 'compact') return compact(v);
    return num(Math.round(v));
  }

  function count(node, v, kind) {
    return '<span data-count="' + v + '" data-kind="' + (kind || 'int') + '">' + fmtBy(kind || 'int', 0) + '</span>';
  }

  var countTimers = [];
  function runCountUps(root) {
    countTimers.forEach(function (id) { cancelAnimationFrame(id); });
    countTimers = [];
    $$('[data-count]', root || document).forEach(function (node) {
      var target = parseFloat(node.getAttribute('data-count')) || 0;
      var kind = node.getAttribute('data-kind') || 'int';
      var dur = 620 + Math.random() * 260;
      var start = null;
      function step(ts) {
        if (start == null) start = ts;
        var p = Math.min(1, (ts - start) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        node.textContent = fmtBy(kind, target * eased);
        if (p < 1) countTimers.push(requestAnimationFrame(step));
        else node.textContent = fmtBy(kind, target);
      }
      countTimers.push(requestAnimationFrame(step));
    });
  }

  function card(opt) {
    var cls = 'card ' + (opt.span ? 's' + opt.span : 's12') + (opt.cls ? ' ' + opt.cls : '');
    var head = '';
    if (opt.title || opt.aside || opt.hint) {
      head = '<div class="card__head"><div>' +
        (opt.title ? '<h3 class="card__title">' + opt.title + '</h3>' : '') +
        (opt.hint ? '<p class="card__hint">' + opt.hint + '</p>' : '') +
        '</div>' + (opt.aside ? '<div class="card__aside">' + opt.aside + '</div>' : '') + '</div>';
    }
    return '<section class="' + cls + '"' + (opt.id ? ' id="' + opt.id + '"' : '') + '>' + head +
      '<div class="card__body">' + (opt.body || '') + '</div>' +
      (opt.foot ? '<div class="card__foot">' + opt.foot + '</div>' : '') + '</section>';
  }

  function stat(span, label, value, delta, foot, cls, id) {
    return '<section class="card ' + (cls || '') + ' s' + span + '"' + (id ? ' id="' + id + '"' : '') + '>' +
      '<div class="card__body" style="display:flex;flex-direction:column;gap:10px">' +
      '<div class="stat__label">' + label + '</div>' +
      '<div class="stat__value">' + value + '</div>' +
      '<div class="stat__row">' + (delta || '') + '</div>' +
      '</div>' +
      (foot ? '<div class="card__foot">' + foot + '</div>' : '') +
      '</section>';
  }

  function progress(pct, cls) {
    return '<div class="progress ' + (cls || '') + '"><span class="progress__fill" style="width:' + clamp(pct, 0, 100) + '%"></span></div>';
  }

  function gameCover(g) {
    var initials = esc(g.name.slice(0, 2).toUpperCase());
    return '<span class="game__cover"><img src="' + esc(g.cover) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'"><span>' + initials + '</span></span>';
  }

  function mcClass(mc) {
    return mc >= 85 ? 'game__mc--great' : mc >= 70 ? 'game__mc--good' : 'game__mc--mixed';
  }

  function avatarHtml(url, name, cls, movie) {
    var initials = esc((name || '?').slice(0, 1).toUpperCase());
    var anim = String(movie || '');
    if (/\.webm(\?|$)|\.mp4(\?|$)/i.test(anim)) {
      return '<video autoplay loop muted playsinline poster="' + esc(url || '') + '">' +
        '<source src="' + esc(anim) + '" type="' + (/\.webm(\?|$)/i.test(anim) ? 'video/webm' : 'video/mp4') + '">' +
        '</video>';
    }
    if (url) return '<img src="' + esc(url) + '" alt="" onerror="this.parentNode.innerHTML=\'<span>' + initials + '</span>\'">';
    return '<span>' + initials + '</span>';
  }

  function profileAvatarHtml(p) {
    var initials = esc((p.persona || '?').slice(0, 1).toUpperCase());
    var anim = String(p.avatar_animated || '');
    var isVideo = /\.webm(\?|$)|\.mp4(\?|$)/i.test(anim);
    if (isVideo) {
      return '<video autoplay loop muted playsinline poster="' + esc(p.avatar || '') + '">' +
        '<source src="' + esc(anim) + '" type="' + (/\.webm(\?|$)/i.test(anim) ? 'video/webm' : 'video/mp4') + '">' +
        '</video><span>' + initials + '</span>';
    }
    if (p.avatar) {
      return '<img src="' + esc(p.avatar) + '" alt="" onerror="this.style.display=\'none\'"><span>' + initials + '</span>';
    }
    return '<span>' + initials + '</span>';
  }

  function presenceState(p) {
    if (p.personastate == null) return { key: 'presenceHidden', tone: 'muted' };
    var s = Number(p.personastate) || 0;
    if (s === 0 && !p.lastlogoff) return { key: 'presenceHidden', tone: 'muted' };
    if (s === 2) return { key: 'presenceBusy', tone: 'busy' };
    if (s === 3 || s === 4) return { key: 'presenceAway', tone: 'away' };
    if (s > 0) return { key: 'presenceOnline', tone: 'online' };
    return { key: 'presenceOffline', tone: 'offline' };
  }

  function presenceBlock(p) {
    var st = presenceState(p);
    if (p.gameextrainfo) {
      var join = '';
      if (p.gameserverip) join = 'steam://connect/' + String(p.gameserverip).replace(/[^0-9a-zA-Z.:_-]/g, '');
      else if (p.gameid) join = 'steam://run/' + String(p.gameid).replace(/\D/g, '');
      return '<div class="presence presence--playing">' +
        '<span class="presence__dot is-online"></span>' +
        '<span class="presence__text">' + esc(t('presencePlaying', { game: p.gameextrainfo })) + '</span>' +
        (join ? '<a class="presence__join" href="' + esc(join) + '">' + t('presenceJoin') + '</a>' : '') +
        '</div>';
    }
    if (p.personastate != null && Number(p.personastate) > 0) {
      return '<div class="presence presence--' + st.tone + '"><span class="presence__dot is-' + st.tone + '"></span>' +
        '<span class="presence__text">' + t(st.key) + '</span></div>';
    }
    if (p.lastlogoff) {
      return '<div class="presence presence--offline"><span class="presence__dot is-offline"></span>' +
        '<span class="presence__text">' + esc(t('presenceLastSeen', { time: timeAgo(p.lastlogoff) })) + '</span></div>';
    }
    return '<div class="presence presence--muted"><span class="presence__dot"></span>' +
      '<span class="presence__text">' + t(st.key) + '</span></div>';
  }

  /* ------------------------------------------------------------------ *
   * 9. profile header
   * ------------------------------------------------------------------ */

  function setProfileBackdrop(p) {
    var image = (p && p.background) || '';
    var movie = (p && p.background_movie) || '';
    var imageNode = $('#backdropImage');
    var video = $('#backdropVideo');
    var hasBg = !!(image || movie);

    document.body.classList.toggle('has-profile-bg', hasBg);
    document.body.classList.toggle('has-profile-movie', !!movie);

    if (imageNode) {
      imageNode.style.backgroundImage = image ? 'url("' + image.replace(/"/g, '%22') + '")' : '';
    }
    if (video) {
      if (movie && video.getAttribute('src') !== movie) {
        video.setAttribute('src', movie);
        try { video.load(); } catch (e) { /* autoplay is best-effort */ }
      }
      if (movie) {
        var play = video.play();
        if (play && play.catch) play.catch(function () { /* muted autoplay is fine to skip */ });
      } else if (video.getAttribute('src')) {
        try { video.pause(); } catch (e) { /* ignore */ }
        video.removeAttribute('src');
      }
    }
  }

  function profileSteamUrl(p) {
    if (p && /^\d{17}$/.test(String(p.steamid || ''))) return 'https://steamcommunity.com/profiles/' + p.steamid;
    return p && p.steamid ? 'https://steamcommunity.com' + p.steamid : 'https://steamcommunity.com';
  }

  function renderProfile(m) {
    var p = m.profile;
    var badge = m.source === 'cached'
      ? '<span class="badge badge--warn">' + t('cachedBadge') + '</span>'
      : '<span class="badge badge--good">' + t('liveBadge') + '</span>';
    var joined = p.created ? dateStr(p.created) : '—';
    var st = presenceState(p);

    return '' +
      '<div class="profile__avatar ' + (p.avatar_animated ? 'is-animated' : '') + '">' + profileAvatarHtml(p) +
      '<i class="profile__dot is-' + st.tone + '"></i></div>' +
      '<div class="profile__main">' +
      '<h2 class="profile__name">' + esc(p.persona || 'Steam') + badge + '</h2>' +
      presenceBlock(p) +
      '<div class="profile__sub">' +
      (p.realname ? '<span>' + esc(p.realname) + '</span><span class="sep">·</span>' : '') +
      '<span>Steam ID ' + esc(p.steamid || '—') + '</span>' +
      (p.level ? '<span class="sep">·</span><span>' + t('steamLevel') + ' ' + p.level + '</span>' : '') +
      (p.country ? '<span class="sep">·</span><span>' + esc(p.country) + '</span>' : '') +
      '<span class="sep">·</span><span>' + t('sinceWord') + ' ' + joined + '</span>' +
      '</div></div>' +
      '<div class="profile__actions">' +
      '<button class="btn btn--primary" type="button" data-action="passport">' +
      '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="3.4" width="12" height="9.2" rx="2" stroke="currentColor" stroke-width="1.3"/><circle cx="5.8" cy="7.2" r="1.3" stroke="currentColor" stroke-width="1.1"/><path d="M4 10.8c.5-1 1.1-1.5 1.8-1.5s1.3.5 1.8 1.5M9.6 6.6h2.8M9.6 9.2h2.8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>' +
      t('passport') + '</button>' +
      '<a class="btn btn--ghost" href="' + esc(profileSteamUrl(p)) + '" target="_blank" rel="noopener noreferrer">' +
      '<svg viewBox="0 0 16 16" fill="none"><path d="M6.2 3.4h-2a1 1 0 0 0-1 1v8.2a1 1 0 0 0 1 1h8.2a1 1 0 0 0 1-1v-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M9.4 2.6h4v4M13 3 7.4 8.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      t('openProfile') + '</a>' +
      '<button class="btn btn--ghost" type="button" data-action="reanalyze">' + t('retry') + '</button>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ *
   * 10. overview
   * ------------------------------------------------------------------ */

  function renderOverview(m) {
    var html = '';
    var invHidden = m.inventoryHidden && !m.inventory.length;

    html += stat(3, t('oHours'),
      count(0, m.totals.hours, 'int') + '<small>' + t('hoursShort') + '</small>',
      '<span class="stat__delta stat__delta--neutral">' +
        t('avgPerGame', { n: num(Math.round(m.totals.avgHours)) }) + '</span>',
      num(Math.round(m.totals.days)) + ' ' + daysWord(Math.round(m.totals.days)) + ' ' + t('daysTotal'));

    html += stat(3, t('oGames'),
      count(0, m.totals.games, 'int'),
      '<span class="stat__delta stat__delta--neutral">' +
        t('playedOf', { n: m.totals.played, m: m.totals.games }) + '</span>',
      m.totals.free + ' ' + t('free').toLowerCase() + ' · ' + m.totals.paid + ' ' + t('paidWord'));

    html += stat(3, t('oPortfolio'),
      count(0, m.money.portfolio, 'money'),
      '<span class="stat__delta stat__delta--neutral">' + t('oInventory') + ': ' + money(m.money.inventory) + '</span>',
      money(m.money.sale) + ' ' + t('ofLibrary') + ' + ' + money(m.money.inventory));

    if (invHidden) {
      html += '<section class="card s3" id="inventoryCard"><div class="card__body" style="display:flex;flex-direction:column;gap:10px">' +
        '<div class="stat__label">' + t('oInventory') + '</div>' +
        '<div class="stat__value" style="font-size:22px">' + t('inventoryHidden') + '</div>' +
        '<div class="stat__row"><span class="badge badge--warn">' + t('inventoryHidden') + '</span></div>' +
        '</div></section>';
    } else {
      html += stat(3, t('oInventory'),
        count(0, m.money.inventory, 'money'),
        '<span class="stat__delta stat__delta--neutral">' + num(m.inventoryTotal || m.inventory.length) + ' ' + t('itemsWord') + '</span>',
        m.inventory.length ? esc(m.inventory[0].name) : t('inventoryEmpty'), '', 'inventoryCard');
    }

    /* curator */
    var paragraphs = portraitParagraphs(m);
    html += card({
      span: 8,
      title: t('curatorTitle'),
      hint: t('curatorBadge'),
      aside: '<span class="badge badge--good">AI</span>',
      body: '<div id="curatorText" class="curator">' +
        paragraphs.map(function (p, i) {
          return '<p class="' + (i === 0 ? 'curator__lead' : '') + '">' + esc(p) + '</p>';
        }).join('') +
        '</div>',
      foot: '<span class="badge">' + esc(genreName(m.topGenre.name)) + ' · ' + Math.round(m.topGenre.share * 100) + '%</span>' +
        '<span class="badge">' + t('qualityTitle') + ' ' + m.quality.avgMc + '/100</span>'
    });

    /* quality + hidden gems */
    html += card({
      span: 4,
      title: t('qualityTitle'),
      hint: t('qualitySub'),
      body: '<div class="stat__value">' + (m.quality.avgMc || '—') + '<small>/100</small></div>' +
        progress(m.quality.avgMc) +
        '<div class="progress__caption"><span>' + t('avgRating') + ' ' + m.quality.avgMc + '</span><span>' +
        t('ratedGames', { n: m.quality.rated }) + '</span></div>' +
        (m.quality.best ? '<p class="tiny muted" style="margin-top:12px">' + t('bestOf') + ': ' + esc(m.quality.best.name) +
          ' · ' + m.quality.best.metacritic + '</p>' : ''),
      foot: '<button class="btn btn--ghost btn--sm" type="button" data-filter="gem">' +
        t('hiddenGems') + '</button>' +
        (m.quality.best ? '<span class="tiny">' + esc(m.quality.best.name) + ' · ' + m.quality.best.metacritic + '</span>' : '')
    });

    /* genres */
    var maxShare = m.genres.length ? m.genres[0].share : 1;
    html += card({
      span: 5,
      title: t('genreTitle'),
      hint: t('genreSub'),
      body: '<div class="compass">' + m.genres.slice(0, 7).map(function (g) {
        return '<div class="compass__row">' +
          '<span class="compass__name">' + esc(genreName(g.name)) + '</span>' +
          '<span class="compass__bar"><span style="width:' + Math.round((g.share / maxShare) * 100) + '%"></span></span>' +
          '<span class="compass__val">' + Math.round(g.share * 100) + '%</span>' +
          '</div>';
      }).join('') + '</div>',
      foot: '<span class="badge">' + m.genres.length + ' ' + t('genresWord') + '</span>' +
        '<span class="badge">' + esc(genreName(m.topGenre.name)) + ' · ' + Math.round(m.topGenre.share * 100) + '%</span>'
    });

    /* rhythm — the online tracker, shown in the visitor's local timezone */
    var maxH = Math.max.apply(null, m.hourly) || 1;
    var tzLabel = m.tz && m.tz.name
      ? t('localTime', { tz: m.tz.name, off: m.tz.offset })
      : t('localTime', { tz: m.tz ? m.tz.offset : 'UTC', off: m.tz ? m.tz.offset : 'UTC' });
    html += card({
      span: 4,
      id: 'rhythmCard',
      title: t('rhythmTitle'),
      hint: t(m.rhythmLabel),
      aside: '<span class="badge">' + m.peakHour + ':00</span>',
      body: '<div class="rhythm">' + m.hourly.map(function (v, i) {
        return '<span class="rhythm__col ' + (i === m.peakHour ? 'is-peak' : '') + '"><i style="height:' + Math.max(3, Math.round((v / maxH) * 100)) + '%"></i></span>';
      }).join('') + '</div>' +
        '<div class="rhythm__scale"><span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>' +
        '<p class="tiny muted rhythm__tz" style="margin-top:10px">' + esc(tzLabel) + '</p>' +
        '<p class="tiny muted" style="margin-top:6px">' + t('rhythmNote', { h: m.peakHour, p: m.peakShare }) + '</p>'
    });

    /* account cleanliness */
    var acc = m.account;
    var accBody = '';
    if (!acc.known) {
      accBody = '<div class="stat__value" style="font-size:22px">' + t('noData') + '</div>' +
        '<p class="tiny muted" style="margin-top:8px">' + t('cleanUnknown') + '</p>';
    } else if (acc.clean) {
      accBody = '<div class="stat__value" style="font-size:22px">' + t('cleanOk') + '</div>' +
        '<p class="tiny muted" style="margin-top:8px">' + t('noBans') + '</p>' +
        '<p class="tiny muted" style="margin-top:4px">' + t('cleanNote') + '</p>';
    } else {
      var rows = [];
      if (acc.vac) rows.push(t('cleanVac') + ': ' + acc.vac);
      if (acc.game) rows.push(t('cleanGame') + ': ' + acc.game);
      if (acc.trade) rows.push(t('cleanTrade') + ': ' + acc.trade);
      if (acc.community) rows.push(t('cleanCommunity') + ': ' + acc.community);
      accBody = '<div class="stat__value" style="font-size:22px">' + t('cleanWarn') + '</div>' +
        '<div class="acc-list">' + rows.map(function (r) {
          return '<div class="metric"><span>' + esc(r) + '</span><b>!</b></div>';
        }).join('') + '</div>' +
        (acc.lastBanDays ? '<p class="tiny muted" style="margin-top:8px">' + t('cleanLastBan', { n: acc.lastBanDays }) + '</p>' : '');
    }
    html += card({
      span: 3,
      title: t('cleanTitle'),
      hint: t('cleanNote'),
      aside: '<span class="badge badge--' + (acc.clean ? 'good' : acc.bans ? 'bad' : '') + '">' +
        (acc.clean ? t('cleanOk') : acc.bans ? t('cleanWarn') : t('noData')) + '</span>',
      body: accBody
    });

    /* library value */
    html += card({
      span: 6,
      title: t('libraryValue'),
      hint: t('libraryValueNote'),
      body:
        '<div class="stat__value" style="font-size:30px">' + money(m.library.value) + '</div>' +
        '<div class="value-rows">' +
        '<div class="metric"><span>' + t('mostExpensive') + '</span><b>' +
          (m.library.priciest
            ? esc(m.library.priciest.name) + ' · ' + money(m.library.priciest.salePrice)
            : t('noData')) + '</b></div>' +
        '<div class="metric"><span>' + t('avgGamePrice') + '</span><b>' + money(m.library.avgPrice) + '</b></div>' +
        '<div class="metric"><span>' + t('realCostPerHour') + '</span><b>' + money(m.library.costPerHour, { digits: 2 }) + '</b></div>' +
        '</div>',
      foot: '<span class="tiny">' + t('costPerHourHint') + '</span>' +
        (m.library.priced < m.totals.games
          ? '<span class="tiny muted">' + t('pricedOf', { n: m.library.priced, m: m.totals.games }) + '</span>'
          : '')
    });

    /* backlog */
    var unplayedPct = Math.round(m.persona.unplayedShare * 100);
    html += card({
      span: 6,
      title: t('backlogTitle'),
      hint: t('backlogGames', { n: m.backlog.games }),
      aside: '<span class="badge badge--warn">' + money(m.backlog.value) + '</span>',
      body: '<div class="row" style="gap:24px;flex-wrap:wrap;margin-bottom:14px">' +
        '<div><div class="tiny muted">' + t('backlogTitle') + '</div><div class="stat__value" style="font-size:26px">' +
          num(m.backlog.games) + ' <small>' + t('gamesWord') + '</small></div></div>' +
        '<div><div class="tiny muted">' + t('backlogTime') + '</div><div class="stat__value" style="font-size:26px">' +
          num(Math.round(m.backlog.hours)) + ' <small>' + t('hoursShort') + '</small></div></div>' +
        '<div><div class="tiny muted">' + t('backlogValue') + '</div><div class="stat__value" style="font-size:26px">' +
          money(m.backlog.value) + '</div></div>' +
        '</div>' +
        progress(unplayedPct, 'progress--thin') +
        '<div class="progress__caption"><span>' + m.totals.never + ' / ' + m.totals.games + '</span><span>' + unplayedPct + '%</span></div>',
      foot: '<span class="tiny">' + t('backlogNote') + '</span>'
    });

    $('#viewOverview').innerHTML = '<div class="bento">' + html + '</div>';
  }

  function serialFor(m) {
    var h = hash31(String(m.profile.steamid) + Math.round(m.totals.hours) + m.totals.games).toString(36).toUpperCase();
    while (h.length < 7) h = '0' + h;
    return 'SK-' + h.slice(0, 4) + '-' + h.slice(4, 7);
  }

  /* ------------------------------------------------------------------ *
   * 11. library
   * ------------------------------------------------------------------ */

  var FILTERS = [
    { key: 'all', label: 'filterAll', test: function () { return true; } },
    { key: 'coop', label: 'filterCoop', test: function (g) { return !!g.tags.coop; } },
    { key: 'weekend', label: 'filterWeekend', test: function (g) { return (g.tags.short && g.hours <= 20) || (g.hours > 0 && g.hours <= 12); } },
    { key: 'never', label: 'filterNever', test: function (g) { return g.hours <= 0.5; } },
    { key: 'gem', label: 'filterMasterpiece', test: function (g) { return g.metacritic >= 85; } },
    { key: 'short', label: 'filterShort', test: function (g) { return g.hours > 0 && g.hours <= 15; } }
  ];

  function gamesFor(m) {
    var f = FILTERS.filter(function (x) { return x.key === state.filter; })[0] || FILTERS[0];
    var q = (state.query || '').toLowerCase();
    return m.games.slice()
      .filter(f.test)
      .filter(function (g) { return !q || g.name.toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) { return b.hours - a.hours || b.metacritic - a.metacritic; });
  }

  function pickGame(m) {
    var fav = m.genres.slice(0, 3).map(function (g) { return g.name; });
    var pool = m.games.filter(function (g) { return !g.software; });
    if (!pool.length) pool = m.games.slice();
    if (!pool.length) return null;
    var scored = pool.map(function (g) {
      var s = 0;
      if (g.hours <= 0.5) s += 55;
      else if (g.hours < 3) s += 42;
      else if (g.hours < 10) s += 18;
      else s -= Math.min(35, g.hours / 12);
      s += (g.metacritic || 62) * 0.55;
      if (g.genres.some(function (x) { return fav.indexOf(x) >= 0; })) s += 20;
      if (g.tags.coop) s += 6;
      if (g.tags.short) s += 7;
      if (g.tags.long) s -= 5;
      if (g.delisted) s -= 8;
      return { g: g, s: s };
    }).sort(function (a, b) { return b.s - a.s; });
    return scored[state.pickIndex % scored.length].g;
  }

  function renderLibrary(m) {
    var list = gamesFor(m);
    var pick = pickGame(m);

    var html = '';

    html += card({
      span: 12,
      title: t('libTitle'),
      hint: t('libSub'),
      body:
        '<div class="row" style="justify-content:space-between;gap:12px;align-items:flex-start">' +
        '<div class="chips" role="tablist">' + FILTERS.map(function (f) {
          var c = m.games.filter(f.test).length;
          return '<button class="chip ' + (state.filter === f.key ? 'is-active' : '') + '" type="button" data-filter="' + f.key + '">' +
            t(f.label) + ' <span class="chip__count">' + c + '</span></button>';
        }).join('') + '</div>' +
        '<input class="input" id="libSearch" style="max-width:220px" placeholder="' + t('searchGames') + '" value="' + esc(state.query) + '">' +
        '</div>'
    });

    /* smart pick — full width */
    if (pick) html += card({
      span: 12,
      title: t('smartPickTitle'),
      hint: t('smartPickSub'),
      cls: 'card--glow',
      aside: '<span class="badge badge--accent">Smart Pick</span>',
      body: '<div class="pick">' +
        '<span class="pick__cover">' +
        '<img src="' + esc(pick.cover) + '" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'">' +
        '</span>' +
        '<div class="pick__meta">' +
        '<div class="pick__name">' + esc(pick.name) + '</div>' +
        '<div class="game__meta"><span>' + esc(genreName(pick.genres[0] || '—')) + '</span>' +
        (pick.metacritic ? '<span class="dot"></span><span class="game__mc ' + mcClass(pick.metacritic) + '">' + pick.metacritic + '</span>' : '') +
        (pick.year ? '<span class="dot"></span><span>' + pick.year + '</span>' : '') +
        '<span class="dot"></span><span>' + (pick.hours <= 0.5 ? t('neverLabel') : hoursLabel(pick.hours)) + '</span>' +
        '<span class="dot"></span><span>' + (pick.price ? money(pick.salePrice) : t('free')) + '</span></div>' +
        '<p class="tiny muted" style="margin-top:8px">' +
        t('smartPickSub') +
        (pick.tags.coop ? ' · ' + t('coopBadge') : '') +
        (pick.tags.short ? ' · ' + t('weekendBadge') : '') + '</p>' +
        '</div>' +
        '<div class="pick__actions">' +
        '<button class="btn btn--ghost btn--sm" type="button" data-action="pick-again">' + t('pickAgain') + '</button>' +
        '<a class="btn btn--primary btn--sm" href="steam://run/' + pick.appid + '">' + t('playNow') + '</a>' +
        '</div>' +
        '</div>'
    });

    /* all games */
    html += card({
      span: 12,
      title: t('allGames'),
      hint: list.length + ' ' + t('gamesWord'),
      aside: '<span class="badge">' + t('filterAll') + ' · ' + m.games.length + '</span>',
      body: list.length ? '<div class="games">' + list.map(function (g) {
        return '<div class="game">' + gameCover(g) +
          '<div style="min-width:0">' +
          '<div class="game__name">' + esc(g.name) +
          (g.delisted ? '<em class="tag-soft">' + t('removedFromStore') + '</em>' : '') +
          (g.software ? '<em class="tag-soft">' + t('softwareBadge') + '</em>' : '') + '</div>' +
          '<div class="game__meta">' +
          '<span>' + esc(genreName(g.genres[0] || '—')) + '</span>' +
          (g.metacritic ? '<span class="dot"></span><span class="game__mc ' + mcClass(g.metacritic) + '">' + g.metacritic + '</span>' : '') +
          (g.year ? '<span class="dot"></span><span>' + g.year + '</span>' : '') +
          '<span class="dot"></span><span>' + (g.price ? money(g.salePrice) : t('free')) + '</span>' +
          (g.tags.coop ? '<span class="dot"></span><span class="badge" style="padding:1px 6px">' + t('coopBadge') + '</span>' : '') +
          '</div></div>' +
          '<div class="game__actions">' +
          '<span class="game__hours">' + (g.hours > 0.5 ? num(Math.round(g.hours)) + ' ' + t('hoursShort') : t('neverLabel')) +
          (g.hours2w ? '<small>+' + num(Math.round(g.hours2w)) + ' / 2w</small>' : '') + '</span>' +
          '<a class="icon-btn" href="steam://run/' + g.appid + '" title="' + t('playNow') + '">' +
          '<svg viewBox="0 0 16 16" fill="none"><path d="M5 3.6 12.2 8 5 12.4V3.6Z" fill="currentColor"/></svg></a>' +
          '</div></div>';
      }).join('') + '</div>' : '<div class="empty"><span class="empty__icon">∅</span>' + t('noGames') + '</div>'
    });

    $('#viewLibrary').innerHTML = '<div class="bento">' + html + '</div>';
  }

  /* ------------------------------------------------------------------ *
   * 12. legacy
   * ------------------------------------------------------------------ */

  function renderLegacy(m) {
    var a = m.achievements;
    var html = '';

    html += card({
      span: 7,
      title: t('legacyRareTitle'),
      hint: t('legacyRareSub'),
      aside: '<span class="badge badge--gold">' + a.unlocked + ' / ' + a.total + '</span>',
      body: a.rarest.length ? '<div class="frames">' + a.rarest.slice(0, 3).map(function (r) {
        return '<div class="frame">' +
          '<span class="frame__icon">' + esc(r.icon || '★') + '</span>' +
          '<div class="frame__name">' + esc(r.name) + '</div>' +
          '<div class="frame__game">' + esc(r.game) + '</div>' +
          '<div class="frame__rare">' + (r.rarity < 1 ? r.rarity.toFixed(1) : Math.round(r.rarity)) + '% ' + t('playersShare') + '</div>' +
          '</div>';
      }).join('') + '</div>' : '<div class="empty"><span class="empty__icon">☆</span>' + t('noData') + '</div>',
      foot: '<span class="tiny">' + Math.round(a.ratio * 100) + '% · ' + a.done.length + ' × 100%</span>'
    });

    html += card({
      span: 5,
      title: t('legacyClosestTitle'),
      hint: t('legacyClosestSub'),
      body: a.closest.length ? '<div class="games">' + a.closest.map(function (g) {
        var p = Math.round((g.ach.unlocked / g.ach.total) * 100);
        return '<div class="game" style="grid-template-columns:1fr auto;padding:9px 4px">' +
          '<div style="min-width:0"><div class="game__name">' + esc(g.name) + '</div>' +
          progress(p, 'progress--thin') +
          '<div class="progress__caption"><span>' + t('achProgress', { a: g.ach.unlocked, t: g.ach.total }) + '</span><span>' + p + '%</span></div></div>' +
          '<span class="badge badge--gold">' + (g.ach.total - g.ach.unlocked) + ' →</span>' +
          '</div>';
      }).join('') + '</div>' : '<div class="empty"><span class="empty__icon">◎</span>' + t('noData') + '</div>',
      foot: '<span class="tiny">' + t('achievementsWord') + '</span>'
    });

    if (a.first) {
      html += card({
        span: 5,
        title: t('legacyCapsuleTitle'),
        hint: t('legacyFirstAch'),
        body: '<div class="capsule">' +
          '<span class="capsule__seal">✦</span>' +
          '<div><div class="capsule__t">' + esc(a.first.name) + '</div>' +
          '<div class="capsule__s">' + esc(a.first.game) + ' · ' + a.first.rarity + '%</div></div>' +
          '<div class="capsule__date">' + t('firstAchOn', { d: dateStr(a.first.date) }) + '</div>' +
          '</div>' +
          '<p class="tiny muted" style="margin-top:12px;line-height:1.6">' + t('legacyCapsuleTitle') + ' · ' + new Date(a.first.date).getFullYear() + '</p>'
      });
    }

    /* timeline */
    var years = m.yearly;
    var selYear = state.year || (years.length ? years[years.length - 1].y : null);
    var sel = years.filter(function (y) { return y.y === selYear; })[0] || years[years.length - 1] || { y: selYear, h: 0, g: 0 };
    var maxY = Math.max.apply(null, years.map(function (y) { return y.h; })) || 1;
    var yearGames = m.games.filter(function (g) { return g.lastYear === sel.y; }).sort(function (a2, b2) { return b2.hours - a2.hours; }).slice(0, 4);

    html += card({
      span: 7,
      title: t('legacyTimelineTitle'),
      hint: t('legacyTimelineSub'),
      aside: '<span class="badge badge--accent">' + t('yearSummary', { h: num(sel.h), g: sel.g }) + '</span>',
      body: '<div class="timeline">' + years.map(function (y) {
        return '<button class="tl-row ' + (y.y === sel.y ? 'is-active' : '') + '" type="button" data-year="' + y.y + '">' +
          '<span class="tl-row__year">' + y.y + '</span>' +
          '<span class="tl-row__bar"><i style="width:' + Math.max(3, Math.round((y.h / maxY) * 100)) + '%"></i></span>' +
          '<span class="tl-row__val">' + num(Math.round(y.h)) + ' ' + t('hoursShort') + '</span>' +
          '</button>';
      }).join('') + '</div>' +
        '<div class="progress__caption" style="margin-top:10px"><span>' +
          t('yearShare', { p: Math.round((sel.h / (m.totals.hours || 1)) * 100) }) + '</span><span>' +
          t('yearAvg', { h: sel.g ? num(Math.round(sel.h / sel.g)) : '0' }) + '</span></div>' +
        (yearGames.length ? '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">' +
          yearGames.map(function (g) {
            return '<div class="row" style="justify-content:space-between;padding:5px 0;font-size:12px">' +
              '<span class="muted">' + esc(g.name) + '</span>' +
              '<span class="strong" style="font-variant-numeric:tabular-nums">' + num(Math.round(g.hours)) + ' ' + t('hoursShort') + '</span></div>';
          }).join('') + '</div>' : '')
    });

    /* museum */
    var museum = m.games.filter(function (g) { return g.delisted; });
    html += card({
      span: 12,
      title: t('legacyMuseumTitle'),
      hint: t('legacyMuseumSub'),
      aside: '<span class="badge badge--gold">' + museum.length + '</span>',
      body: museum.length ? '<div class="frames">' + museum.map(function (g) {
        return '<div class="frame">' +
          '<div class="row" style="justify-content:space-between"><span class="frame__icon">⌘</span>' +
          '<span class="badge badge--gold">' + t('removedFromStore') + '</span></div>' +
          '<div class="frame__name">' + esc(g.name) + '</div>' +
          '<div class="frame__game">' + g.year + ' · ' + esc(genreName(g.genres[0] || '—')) + '</div>' +
          '<div class="row" style="justify-content:space-between"><span class="tiny muted">' + (g.hours ? hoursLabel(g.hours) : t('neverLabel')) + '</span>' +
          '<span class="tiny muted">' + (g.metacritic || '—') + '</span></div>' +
          '</div>';
      }).join('') + '</div>' : '<div class="empty"><span class="empty__icon">▤</span>' + t('legacyMuseumEmpty') + '</div>',
      foot: '<span class="tiny">' + t('legacyMuseumSub') + '</span>'
    });

    $('#viewLegacy').innerHTML = '<div class="bento">' + html + '</div>';
  }

  /* ------------------------------------------------------------------ *
   * 13. social
   * ------------------------------------------------------------------ */

  function renderSocial(m) {
    var html = '';

    html += card({
      span: 12,
      title: t('socialCompareTitle'),
      hint: t('socialCompareSub'),
      body:
        '<div class="compare-zone" id="rivalZone">' +
        '<div class="duel-slots">' +
        '<div class="duel-slot" data-slot="a" id="duelSlotA">' +
        '<span class="duel-slot__tag">' + t('duelPlayer1') + '</span>' +
        '<span class="duel-slot__ava" id="duelAvaA"></span>' +
        '<span class="duel-slot__body"><b id="duelNameA">—</b><small id="duelHintA">' + t('duelYou') + '</small></span>' +
        '</div>' +
        '<span class="duel__vs">VS</span>' +
        '<div class="duel-slot" data-slot="b" id="duelSlotB">' +
        '<span class="duel-slot__tag">' + t('duelPlayer2') + '</span>' +
        '<span class="duel-slot__ava" id="duelAvaB"></span>' +
        '<span class="duel-slot__body"><b id="duelNameB">—</b><small id="duelHintB">' + t('rivalDrop') + '</small></span>' +
        '</div>' +
        '</div>' +
        '<div class="rival-manual">' +
        '<div class="field"><label>' + t('compareFriend') + '</label>' +
        '<input class="input" id="rivalInput" placeholder="' + t('comparePlaceholder') + '"></div>' +
        '<button class="btn btn--primary btn--sm" type="button" data-action="compare">' + t('compareBtn') + '</button>' +
        '</div>' +
        '<p class="tiny muted rival-drop">' + t('friendsDrag') + '</p>' +
        '</div>' +
        '<div id="compareResult"></div>'
    });

    html += card({
      span: 12,
      title: t('friendsTitle'),
      hint: t('friendsSub'),
      aside: '<span class="badge badge--accent">' + m.friends.length + '</span>',
      body: m.friends.length
        ? '<p class="tiny muted" style="margin-bottom:10px">' + t('friendsDrag') + '</p>' +
          '<div class="friends friends--scroll" id="friendsList">' + m.friends.map(function (f, i) {
            var sid = String(f.steamid || '');
            var key = sid || String(i);
            var score = f.compat == null ? '—' : f.compat + '%';
            return '<div class="friend" draggable="true" data-friend="' + esc(key) + '"' +
              ' data-persona="' + esc(f.persona || '') + '"' +
              ' data-avatar="' + esc(f.avatar || '') + '">' +
              '<span class="friend__ava">' + avatarHtml(f.avatar, f.persona, '', f.avatar_animated) + '</span>' +
              '<div style="min-width:0"><div class="friend__name">' + esc(f.persona) + '</div>' +
              '<div class="friend__sub">' + t('sharedGames', { n: f.shared.length }) + (f.shared.length ? ' · ' + esc(f.shared.slice(0, 2).join(', ')) : '') + '</div></div>' +
              '<div class="friend__score"><b>' + score + '</b><small>' + t('compat') + '</small></div>' +
              '</div>';
          }).join('') + '</div>'
        : '<div class="empty"><span class="empty__icon">♧</span>' + t('friendsEmpty') + '</div>'
    });

    $('#viewSocial').innerHTML = '<div class="bento">' + html + '</div>';
    if (!state.duel.a) state.duel.a = state.model;
    updateDuelSlots();
  }

  /* ------------------------------------------------------------------ *
   * 13b. friend context menu
   * ------------------------------------------------------------------ */

  function closeFriendMenu() {
    var menu = $('#friendMenu');
    if (menu) menu.remove();
  }

  function openFriendMenu(steamid, persona, avatar, x, y) {
    closeFriendMenu();
    var menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.id = 'friendMenu';
    menu.setAttribute('role', 'menu');
    menu.__steamid = steamid;
    menu.__persona = persona || '';
    menu.__avatar = avatar || '';
    menu.innerHTML =
      '<div class="ctx-menu__head">' + esc(persona || steamid) + '</div>' +
      '<button type="button" role="menuitem" data-friend-cmd="slotA">' + esc(t('menuSlotA')) + '</button>' +
      '<button type="button" role="menuitem" data-friend-cmd="slotB">' + esc(t('menuSlotB')) + '</button>' +
      '<button type="button" role="menuitem" data-friend-cmd="open">' + esc(t('menuOpenSteam')) + '</button>';
    document.body.appendChild(menu);
    var w = menu.offsetWidth;
    var h = menu.offsetHeight;
    menu.style.left = Math.max(12, Math.min(x, window.innerWidth - w - 12)) + 'px';
    menu.style.top = Math.max(12, Math.min(y, window.innerHeight - h - 12)) + 'px';
  }

  function runFriendCommand(cmd) {
    var menu = $('#friendMenu');
    var steamid = menu ? menu.__steamid : '';
    var persona = menu ? menu.__persona : '';
    var avatar = menu ? menu.__avatar : '';
    closeFriendMenu();
    if (!steamid) return;
    if (cmd === 'slotA') setDuelSlot('a', steamid, persona, avatar);
    else if (cmd === 'slotB') setDuelSlot('b', steamid, persona, avatar);
    else if (cmd === 'open') analyze(steamid);
  }

  /* ------------------------------------------------------------------ *
   * 13c. duel slots — drop a friend into Player 1 / Player 2
   * ------------------------------------------------------------------ */

  function duelSelf() {
    return state.model && state.model.profile ? String(state.model.profile.steamid || '') : '';
  }

  function updateDuelSlots() {
    [['a', '#duelNameA', '#duelHintA', '#duelAvaA'], ['b', '#duelNameB', '#duelHintB', '#duelAvaB']].forEach(function (row) {
      var fighter = state.duel[row[0]];
      var nameNode = $(row[1]);
      var hintNode = $(row[2]);
      var avaNode = $(row[3]);
      if (!nameNode) return;
      var profile = fighter && fighter.profile;
      if (profile) {
        var isSelf = String(profile.steamid || '') && String(profile.steamid) === duelSelf();
        nameNode.textContent = profile.persona || 'Steam';
        if (hintNode) {
          hintNode.textContent = isSelf ? t('duelYou')
            : (fighter.totals ? num(fighter.totals.games) + ' ' + t('gamesWord') : '');
        }
        if (avaNode) avaNode.innerHTML = avatarHtml(profile.avatar, profile.persona, '', profile.avatar_animated);
      } else {
        nameNode.textContent = '—';
        if (hintNode) hintNode.textContent = row[0] === 'a' ? t('duelYou') : t('duelDrop');
        if (avaNode) avaNode.innerHTML = '';
      }
    });
  }

  function afterDuelChange() {
    updateDuelSlots();
    var a = state.duel.a;
    var b = state.duel.b;
    var host = $('#compareResult');
    if (a && b && a.totals && b.totals) {
      state.compare = { a: a, b: b };
      renderCompare(a, b);
    } else {
      state.compare = null;
      if (host) host.innerHTML = '<div class="note" style="margin-top:14px">' + t('duelNeedTwo') + '</div>';
    }
    syncView();
  }

  function setDuelSlot(slot, steamid, persona, avatar) {
    if (!state.model) { toast(t('toastNoProfile'), 'warn'); return; }
    if (!API_BASE) { toast(t('toastSteamDown'), 'warn'); return; }
    if (state.view !== 'social') setView('social');

    var zone = $('#rivalZone');
    if (zone) {
      try { zone.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { zone.scrollIntoView(); }
    }

    /* keep a valid counterpart so a single drop always yields a real battle */
    if (slot === 'b' && !state.duel.a) state.duel.a = state.model;
    if (slot === 'a' && !state.duel.b) state.duel.b = state.model;

    if (duelSelf() && String(steamid) === duelSelf()) {
      state.duel[slot] = state.model;
      afterDuelChange();
      return;
    }

    var host = $('#compareResult');
    if (host) host.innerHTML = '<div class="note" style="margin-top:14px">' + esc(t('curatorThinking')) + '</div>';
    fetchLive(steamid).then(function (data) {
      state.duel[slot] = buildModel(hydrate(data));
      afterDuelChange();
    }).catch(function () {
      state.duel[slot] = {
        profile: { steamid: steamid, persona: persona || 'Steam friend', avatar: avatar || '', avatar_animated: '' }
      };
      updateDuelSlots();
      toast(t('toastSteamDown'), 'warn');
    });
  }

  /* ------------------------------------------------------------------ *
   * 14. steam news & deals ticker
   * ------------------------------------------------------------------ */

  function renderTicker(data) {
    var track = $('#hallTrack');
    var ticker = $('#hallTicker');
    if (!track || !ticker) return;
    var items = (data && data.items) || [];
    var html = '';

    items.forEach(function (row) {
      if (!row || !row.url) return;
      var badge = row.game || t('feedNews');
      html += '<a class="tick-news" href="' + esc(row.url) + '" target="_blank" rel="noopener noreferrer">' +
        '<span class="tick-news__k">' + esc(badge) + '</span>' +
        '<span class="tick-news__t">' + esc(row.title || '') + '</span>' +
        '</a>';
    });

    if (!html) {
      ticker.classList.add('is-empty');
      track.innerHTML = '<span class="tick-empty">' + esc(t('feedEmpty')) + '</span>';
      return;
    }

    ticker.classList.remove('is-empty');
    /* two identical halves → seamless -50% marquee */
    track.innerHTML = html + html;
  }

  function renderFeedPick(apps) {
    var pick = $('#feedPick');
    if (!pick) return;
    var current = state.feedGame || '';
    var html = '<option value="">' + esc(t('feedAll')) + '</option>';
    (apps || []).forEach(function (a) {
      html += '<option value="' + esc(a.appid) + '">' + esc(a.name) + '</option>';
    });
    pick.innerHTML = html;
    pick.value = current;
    /* the saved filter may not exist for this profile — fall back to «all» */
    if (pick.value !== current) {
      pick.value = '';
      state.feedGame = '';
    }
  }

  function applyFeedCollapsed() {
    var ticker = $('#hallTicker');
    var btn = $('#feedToggle');
    if (ticker) ticker.classList.toggle('is-collapsed', !!state.feedCollapsed);
    if (btn) {
      var label = t(state.feedCollapsed ? 'feedExpand' : 'feedCollapse');
      btn.textContent = state.feedCollapsed ? '⌄' : '⌃';
      btn.setAttribute('title', label);
      btn.setAttribute('aria-label', label);
    }
  }

  function loadFeed() {
    if (!API_BASE) return;
    var url = API_BASE + '/steam-news' + (state.feedGame ? '?appid=' + encodeURIComponent(state.feedGame) : '');
    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data) return;
        renderFeedPick(data.apps);
        renderTicker(data);
      })
      .catch(function () { /* the ticker is decorative — never break the page */ });
  }

  /* ------------------------------------------------------------------ *
   * 15. compare result
   * ------------------------------------------------------------------ */

  function renderCompare(a, b) {
    var host = $('#compareResult');
    if (!host) return;
    if (!b) {
      host.innerHTML = '<div class="note" style="margin-top:14px">' + t('compareNeedFriend') + '</div>';
      return;
    }
    var rows = duelRows(a, b);
    var wins = 0, losses = 0;
    rows.forEach(function (r) { if (r.a > r.b) wins++; else if (r.b > r.a) losses++; });
    var verdict = wins === losses ? t('compareDraw')
      : t('compareVerdict', { w: wins > losses ? esc(a.profile.persona) : esc(b.profile.persona), n: Math.max(wins, losses), m: rows.length });

    function meta(x) {
      return num(x.totals.hours) + ' ' + t('hoursShort') + ' · ' + x.totals.games + ' ' + t('gamesWord');
    }

    host.innerHTML =
      '<div class="duel">' +
      '<div class="duel__head">' +
      '<div class="duel__side"><span class="duel__ava">' + profileAvatarHtml(a.profile) + '</span>' +
      '<div style="min-width:0"><div class="duel__name">' + esc(a.profile.persona) + '</div><div class="duel__meta">' + meta(a) + '</div></div></div>' +
      '<span class="duel__vs">VS</span>' +
      '<div class="duel__side duel__side--r"><div style="min-width:0"><div class="duel__name">' + esc(b.profile.persona) + '</div><div class="duel__meta">' + meta(b) + '</div></div>' +
      '<span class="duel__ava">' + profileAvatarHtml(b.profile) + '</span></div>' +
      '</div>' +
      rows.map(function (r) {
        var total = (r.a + r.b) || 1;
        var pa = Math.round((r.a / total) * 100);
        var pb = 100 - pa;
        var fa = r.fmt === 'money' ? money(r.a) : r.fmt === 'hours' ? num(Math.round(r.a)) + ' ' + t('hoursShort') : num(r.a);
        var fb = r.fmt === 'money' ? money(r.b) : r.fmt === 'hours' ? num(Math.round(r.b)) + ' ' + t('hoursShort') : num(r.b);
        return '<div class="duel__label">' + t(r.label) + '</div>' +
          '<div class="duel__row">' +
          '<span class="duel__val duel__val--l">' + fa + '</span>' +
          '<div class="duel__bar duel__bar--l"><i style="width:' + pa + '%"></i></div>' +
          '<div class="duel__bar duel__bar--r"><i style="width:' + pb + '%"></i></div>' +
          '<span class="duel__val duel__val--r">' + fb + '</span>' +
          '</div>';
      }).join('') +
      '<div class="verdict">★ <span>' + verdict + '</span></div>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ *
   * 16. toasts, modal, clipboard
   * ------------------------------------------------------------------ */

  function toast(message, type) {
    var host = $('#toasts');
    if (!host) return;
    var node = el('<div class="toast ' + (type ? 'toast--' + type : '') + '">' +
      '<span class="toast__icon">' + (type === 'warn' ? '!' : type === 'error' ? '×' : '✓') + '</span>' +
      '<span>' + esc(message) + '</span></div>');
    host.appendChild(node);
    setTimeout(function () {
      node.classList.add('is-out');
      setTimeout(function () { node.remove(); }, 260);
    }, 4200);
  }

  function copyText(text, okMsg) {
    function done() { toast(okMsg || t('copied')); }
    function fail() { toast(t('copyFailed'), 'warn'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { legacyCopy(text, done, fail); });
    } else {
      legacyCopy(text, done, fail);
    }
  }

  function legacyCopy(text, done, fail) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      ok ? done() : fail();
    } catch (e) { fail(); }
  }

  function openModal(html, narrow) {
    $('#modalRoot').innerHTML =
      '<div class="modal" data-modal>' +
      '<div class="modal__backdrop" data-action="modal-close"></div>' +
      '<div class="modal__panel ' + (narrow ? 'modal__panel--narrow' : '') + '">' + html + '</div>' +
      '</div>';
    document.body.classList.add('is-locked');
  }

  function closeModal() {
    $('#modalRoot').innerHTML = '';
    document.body.classList.remove('is-locked');
  }

  /* ------------------------------------------------------------------ *
   * 17. Digital Passport
   * ------------------------------------------------------------------ */

  function passportAvatarSrc(p) {
    return proxied(p.avatar || '');
  }

  function passportCard(m) {
    var p = m.profile;
    var initials = esc((p.persona || '?').slice(0, 1).toUpperCase());
    var src = passportAvatarSrc(p);
    var ava = src
      ? '<img src="' + esc(src) + '" alt="" crossorigin="anonymous" onerror="this.style.display=\'none\'">'
      : '';
    var issued = dateStr(Date.now());
    var createdYear = m.profile.created ? new Date(m.profile.created).getFullYear() : (m.persona.createdYear || '—');
    var favGenre = m.genres.length ? genreName(m.topGenre.name) : '—';

    return '<div class="passport" id="passportCard">' +
      '<div class="passport__top"><span class="passport__brand">STEAM KOSHEL</span>' +
      '<span class="passport__tier">' + t('profileId') + ' · ' + esc(String(p.steamid || '').slice(-6)) + '</span></div>' +
      '<div class="passport__id"><div class="passport__ava">' + ava + '<span>' + initials + '</span></div>' +
      '<div><div class="passport__name">' + esc(p.persona) + '</div>' +
      '<div class="passport__handle">STEAM ID ' + esc(p.steamid || '—') + '</div></div></div>' +
      '<div class="passport__grid">' +
      '<div class="passport__cell"><div class="passport__k">' + t('oHours') + '</div><div class="passport__value">' + num(m.totals.hours) + ' ' + t('hoursShort') + '</div></div>' +
      '<div class="passport__cell"><div class="passport__k">' + t('oGames') + '</div><div class="passport__value">' + num(m.totals.games) + '</div></div>' +
      '<div class="passport__cell"><div class="passport__k">' + t('oPortfolio') + '</div><div class="passport__value">' + money(m.money.portfolio) + '</div></div>' +
      '<div class="passport__cell"><div class="passport__k">' + t('achievementsWord') + '</div><div class="passport__value">' + num(m.achievements.unlocked) + '</div></div>' +
      '<div class="passport__cell"><div class="passport__k">' + t('favoriteGenre') + '</div><div class="passport__value">' + esc(favGenre) + '</div></div>' +
      '<div class="passport__cell"><div class="passport__k">' + t('sinceWord') + '</div><div class="passport__value">' + esc(String(createdYear)) + '</div></div>' +
      '</div>' +
      '<div class="passport__genres">' + m.genres.slice(0, 4).map(function (g) {
        return '<span class="passport__genre">' + esc(genreName(g.name)) + ' ' + Math.round(g.share * 100) + '%</span>';
      }).join('') + '</div>' +
      '<div class="passport__dna"><div><div class="passport__dna-label">' + t('passportCode') + '</div>' +
      '<div class="passport__dna-code">' + serialFor(m) + '</div></div>' +
      '<div style="text-align:right"><div class="passport__dna-label">' + t('passportIssued') + '</div>' +
      '<div class="passport__dna-code" style="font-size:9px">' + esc(issued) + '</div></div></div>' +
      '<div class="passport__note">' + t('passportScan') + ' · ' + t('passportFree') + '</div>' +
      '</div>';
  }

  function bbCode(m) {
    var lines = [];
    lines.push('[b]STEAM KOSHEL[/b] — Digital Passport');
    lines.push('[b]' + (m.profile.persona || 'Steam') + '[/b] · ' + t('passportCode') + ': ' + serialFor(m));
    lines.push('');
    lines.push('[b]' + t('oHours') + ':[/b] ' + num(m.totals.hours) + ' ' + t('hoursShort'));
    lines.push('[b]' + t('oGames') + ':[/b] ' + num(m.totals.games));
    lines.push('[b]' + t('oPortfolio') + ':[/b] ' + money(m.money.portfolio));
    lines.push('[b]' + t('achievementsWord') + ':[/b] ' + num(m.achievements.unlocked) + ' / ' + num(m.achievements.total));
    lines.push('[b]' + t('favoriteGenre') + ':[/b] ' + genreName(m.topGenre.name));
    lines.push('[b]' + t('sinceWord') + ':[/b] ' + (m.profile.created ? new Date(m.profile.created).getFullYear() : '—'));
    lines.push('');
    lines.push('[i]' + m.genres.slice(0, 3).map(function (g) { return genreName(g.name); }).join(' · ') + '[/i]');
    lines.push('[url=' + profileSteamUrl(m.profile) + ']Steam profile[/url]');
    return lines.join('\n');
  }

  function openPassport() {
    var m = state.model;
    if (!m) { toast(t('toastNoProfile'), 'warn'); return; }
    openModal(
      '<div class="modal__head">' +
      '<div><div class="modal__title">' + t('passportTitle') + '</div>' +
      '<div class="modal__sub">' + t('passportSub') + '</div></div>' +
      '<button class="icon-btn modal__close" type="button" data-action="modal-close">✕</button>' +
      '</div>' +
      '<div class="modal__body"><div class="passport-layout">' +
      '<div>' + passportCard(m) + '</div>' +
      '<div class="passport-actions">' +
      '<button class="btn btn--primary btn--block" type="button" data-action="download-png">' + t('downloadPng') + '</button>' +
      '<div class="field" style="margin-top:6px"><label>' + t('passportBB') + '</label>' +
      '<textarea class="bb" id="bbCode" readonly>' + esc(bbCode(m)) + '</textarea></div>' +
      '<button class="btn btn--ghost btn--block" type="button" data-action="copy-bb">' + t('copyBB') + '</button>' +
      '<p class="tiny muted">' + t('passportSerial') + ': ' + serialFor(m) + '</p>' +
      '</div></div></div>'
    );
  }

  function downloadPassport() {
    var m = state.model;
    if (!m) return;
    var cardNode = $('#passportCard');
    var name = 'steam-koshel-' + String(m.profile.persona || 'profile').replace(/[^\w-]+/g, '_') + '.png';

    function save(canvas) {
      try {
        var a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = name;
        a.click();
        toast(t('downloadPng'));
      } catch (e) {
        toast(t('copyFailed'), 'warn');
      }
    }

    if (window.html2canvas && cardNode) {
      window.html2canvas(cardNode, {
        backgroundColor: '#0a0a0c',
        scale: 2,
        useCORS: true,
        logging: false
      }).then(save).catch(function () {
        drawFallbackPassport(m).then(save);
      });
    } else {
      drawFallbackPassport(m).then(save);
    }
  }

  function drawFallbackPassport(m) {
    return new Promise(function (resolve) {
      var W = 760, H = 820;
      var canvas = document.createElement('canvas');
      canvas.width = W * 2;
      canvas.height = H * 2;
      var ctx = canvas.getContext('2d');
      ctx.scale(2, 2);

      var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7C5CFF';

      var bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#17171c');
      bg.addColorStop(1, '#0a0a0c');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      var glow = ctx.createRadialGradient(W * 0.2, 0, 20, W * 0.2, 0, W * 0.9);
      glow.addColorStop(0, accent + '99');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H * 0.7);

      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 2;
      roundRect(ctx, 20, 20, W - 40, H - 40, 34);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.font = '700 13px Inter, sans-serif';
      ctx.letterSpacing = '4px';
      ctx.fillText('STEAM KOSHEL', 52, 72);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '700 10px Inter, sans-serif';
      ctx.fillText(t('profileId') + ' · ' + String(m.profile.steamid || '').slice(-6), W - 52, 72);
      ctx.textAlign = 'left';

      ctx.fillStyle = accent;
      roundRect(ctx, 52, 106, 96, 96, 26);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '700 40px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText((m.profile.persona || '?').slice(0, 1).toUpperCase(), 100, 168);
      ctx.textAlign = 'left';

      ctx.fillStyle = '#fff';
      ctx.font = '700 34px Inter, sans-serif';
      ctx.fillText(String(m.profile.persona || 'Steam').slice(0, 22), 176, 150);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '500 13px Inter, sans-serif';
      ctx.fillText('STEAM ID ' + (m.profile.steamid || '—'), 176, 178);

      var createdYear = m.profile.created ? new Date(m.profile.created).getFullYear() : '—';
      var cells = [
        [t('oHours'), num(m.totals.hours) + ' ' + t('hoursShort')],
        [t('oGames'), num(m.totals.games)],
        [t('oPortfolio'), money(m.money.portfolio)],
        [t('achievementsWord'), num(m.achievements.unlocked)],
        [t('favoriteGenre'), genreName(m.topGenre.name)],
        [t('sinceWord'), String(createdYear)]
      ];
      var cw = (W - 104 - 24) / 3;
      cells.forEach(function (c, i) {
        var x = 52 + (i % 3) * (cw + 12);
        var y = 240 + Math.floor(i / 3) * 108;
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        roundRect(ctx, x, y, cw, 92, 16);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.42)';
        ctx.font = '500 10px Inter, sans-serif';
        ctx.fillText(String(c[0]).toUpperCase().slice(0, 26), x + 14, y + 28);
        ctx.fillStyle = '#fff';
        ctx.font = '700 19px Inter, sans-serif';
        ctx.fillText(String(c[1]).slice(0, 18), x + 14, y + 62);
      });

      var gy = 480;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(52, gy, W - 104, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '500 13px Inter, sans-serif';
      var top = m.genres.slice(0, 3).map(function (g) { return genreName(g.name) + ' ' + Math.round(g.share * 100) + '%'; }).join('   ·   ');
      ctx.fillText(top, 52, gy + 40);

      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '500 11px Inter, sans-serif';
      ctx.fillText(t('passportCode'), 52, 610);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '600 16px monospace';
      ctx.fillText(serialFor(m), 52, 638);

      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '500 10px Inter, sans-serif';
      ctx.fillText(t('passportIssued') + ' ' + dateStr(Date.now()), 52, 690);
      ctx.fillText(t('passportScan'), 52, 712);
      ctx.fillText(t('passportFree'), 52, 734);

      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.font = '500 10px Inter, sans-serif';
      ctx.fillText('steam koshel · digital passport', 52, H - 52);

      var avatar = passportAvatarSrc(m.profile);
      if (!avatar) { resolve(canvas); return; }
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          ctx.save();
          roundRect(ctx, 52, 106, 96, 96, 26);
          ctx.clip();
          var scale = Math.max(96 / img.width, 96 / img.height);
          var dw = img.width * scale, dh = img.height * scale;
          ctx.drawImage(img, 52 + (96 - dw) / 2, 106 + (96 - dh) / 2, dw, dh);
          ctx.restore();
          ctx.strokeStyle = 'rgba(255,255,255,0.2)';
          ctx.lineWidth = 1;
          roundRect(ctx, 52, 106, 96, 96, 26);
          ctx.stroke();
        } catch (e) { /* keep the letter avatar */ }
        resolve(canvas);
      };
      img.onerror = function () { resolve(canvas); };
      img.src = avatar;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ------------------------------------------------------------------ *
   * 18. i18n application + full render
   * ------------------------------------------------------------------ */

  function applyStaticI18n() {
    document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : state.lang;
    $$('[data-i18n]').forEach(function (node) {
      node.textContent = t(node.getAttribute('data-i18n'));
    });
    $$('[data-i18n-ph]').forEach(function (node) {
      node.setAttribute('placeholder', t(node.getAttribute('data-i18n-ph')));
    });
    $$('#langSwitch [data-lang]').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-lang') === state.lang);
    });
    $$('#currencySwitch [data-cur]').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-cur') === state.cur);
    });
  }

  function renderAll() {
    var m = state.model;
    if (!m) return;
    $('#profileHead').innerHTML = renderProfile(m);
    renderOverview(m);
    renderLibrary(m);
    renderLegacy(m);
    renderSocial(m);
    if (state.compare) renderCompare(state.compare.a, state.compare.b);
    syncView();
    runCountUps($('#results'));
  }

  function markNav(name) {
    $$('.side-tab').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-nav') === name);
    });
  }

  function syncView() {
    $$('.view').forEach(function (v) { v.hidden = v.getAttribute('data-view') !== state.view; });
    var battle = state.view === 'social' && state.compare && state.compare.a && state.compare.b;
    document.body.classList.toggle('has-battle-bg', !!battle);
    if (battle) setBattleBackdrop(state.compare.a.profile, state.compare.b.profile);
    else clearBattleBackdrop();
    markNav(state.view);
    bindScrollSpy();
  }

  function setView(name) {
    if (['overview', 'library', 'legacy', 'social'].indexOf(name) < 0) return;
    state.view = name;
    syncView();
    if (state.model) runCountUps($('#view' + name.charAt(0).toUpperCase() + name.slice(1)));
  }

  var spyObserver = null;

  /* highlight «Инвентарь» / «Трекер онлайна» while their card crosses the
     middle of the screen */
  function bindScrollSpy() {
    if (spyObserver) { spyObserver.disconnect(); spyObserver = null; }
    if (!window.IntersectionObserver || state.view !== 'overview') return;
    var targets = [$('#rhythmCard'), $('#inventoryCard')].filter(Boolean);
    if (!targets.length) return;
    spyObserver = new IntersectionObserver(function (entries) {
      if (state.view !== 'overview') return;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        markNav(entry.target.id === 'rhythmCard' ? 'tracker' : 'inventory');
      });
    }, { rootMargin: '-42% 0px -42% 0px', threshold: 0 });
    targets.forEach(function (node) { spyObserver.observe(node); });
  }

  function navTo(name) {
    if (name === 'passport') { openPassport(); return; }
    if (name === 'inventory' || name === 'tracker') {
      setView('overview');
      markNav(name);
      var anchor = name === 'tracker' ? $('#rhythmCard') : $('#inventoryCard');
      if (anchor) {
        try { anchor.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { anchor.scrollIntoView(); }
      }
      return;
    }
    setView(name);
    var target = $('#results') || $('#view' + name.charAt(0).toUpperCase() + name.slice(1));
    if (target) {
      try { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { target.scrollIntoView(); }
    }
  }

  /* two halves of the screen: each fighter's own wallpaper / live background */
  function fillBattleVideo(video, src) {
    if (!video) return;
    if (src && video.getAttribute('src') !== src) {
      video.setAttribute('src', src);
      try { video.load(); } catch (e) { /* autoplay is best-effort */ }
    }
    if (src) {
      var play = video.play();
      if (play && play.catch) play.catch(function () { /* muted autoplay is fine to skip */ });
    } else if (video.getAttribute('src')) {
      try { video.pause(); } catch (e) { /* ignore */ }
      video.removeAttribute('src');
    }
  }

  function setBattleBackdrop(p1, p2) {
    var left = $('#battleLeft');
    var right = $('#battleRight');
    if (left && right) {
      var lImg = (p1 && p1.background) || '';
      var rImg = (p2 && p2.background) || '';
      left.style.backgroundImage = lImg ? 'url("' + lImg.replace(/"/g, '%22') + '")' : '';
      right.style.backgroundImage = rImg ? 'url("' + rImg.replace(/"/g, '%22') + '")' : '';
    }
    fillBattleVideo($('#battleVideoL'), (p1 && p1.background_movie) || '');
    fillBattleVideo($('#battleVideoR'), (p2 && p2.background_movie) || '');
  }

  function clearBattleBackdrop() {
    var left = $('#battleLeft');
    var right = $('#battleRight');
    if (left) left.style.backgroundImage = '';
    if (right) right.style.backgroundImage = '';
    fillBattleVideo($('#battleVideoL'), '');
    fillBattleVideo($('#battleVideoR'), '');
  }

  function setLang(lang) {
    if (['ru', 'en', 'zh'].indexOf(lang) < 0) return;
    state.lang = lang;
    persist();
    applyStaticI18n();
    renderHistory();
    if (state.model) renderAll();
    updateUrl();
    updateMeta(state.model);
    applyFeedCollapsed();
    loadFeed();
  }

  function setCurrency(cur) {
    if (['RUB', 'USD', 'CNY'].indexOf(cur) < 0) return;
    state.cur = cur;
    persist();
    applyStaticI18n();
    if (state.model) renderAll();
    loadFeed();
  }

  function applyAccent(hex) {
    if (!hex) return;
    var root = document.documentElement.style;
    root.setProperty('--accent', hex);
    var second = hex.toLowerCase() === '#55e6c8' ? '#7c5cff' : '#55e6c8';
    root.setProperty('--accent-2', second);
  }

  function updateMeta(m) {
    function set(prop, content, attr) {
      var node = document.querySelector('meta[' + (attr || 'property') + '="' + prop + '"]');
      if (!node) {
        node = document.createElement('meta');
        node.setAttribute(attr || 'property', prop);
        document.head.appendChild(node);
      }
      node.setAttribute('content', content);
    }
    if (!m) return;
    var title = m.profile.persona + ' — Steam Koshel';
    var desc = t('oHours') + ': ' + num(m.totals.hours) + ' · ' + t('oGames') + ': ' + m.totals.games +
      ' · ' + t('oPortfolio') + ': ' + money(m.money.portfolio);
    document.title = title;
    set('og:title', title);
    set('og:description', desc);
    set('twitter:title', title);
    set('twitter:description', desc);
  }

  /* ------------------------------------------------------------------ *
   * 19. data loading
   * ------------------------------------------------------------------ */

  var API_BASE = (location.protocol === 'http:' || location.protocol === 'https:') ? '/api' : null;

  function fetchLive(query) {
    var url = API_BASE + '/profile?q=' + encodeURIComponent(query) + '&lang=' + state.lang + '&cur=' + state.cur;
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (res) {
      if (res.status === 403) {
        var err = new Error('private');
        err.kind = 'private';
        throw err;
      }
      if (!res.ok) {
        var e2 = new Error('http ' + res.status);
        e2.kind = res.status === 503 ? 'nokey' : 'http';
        throw e2;
      }
      return res.json();
    });
  }

  /* loader */

  function showLoader(steps) {
    var box = $('#loader');
    if (!box) return;
    $('#loaderTitle').textContent = steps[0];
    $('#loaderPct').textContent = '0%';
    $('#loaderFill').style.width = '4%';
    $('#loaderSteps').innerHTML = steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    box.hidden = false;
    try { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { box.scrollIntoView(); }
  }

  function hideLoader() {
    var box = $('#loader');
    if (box) box.hidden = true;
  }

  function runLoader(steps) {
    return new Promise(function (resolve) {
      var i = 0;
      function tick() {
        if (i >= steps.length) {
          $('#loaderFill').style.width = '100%';
          $('#loaderPct').textContent = '100%';
          $$('#loaderSteps li').forEach(function (li) { li.className = 'is-done'; });
          setTimeout(resolve, 220);
          return;
        }
        $$('#loaderSteps li').forEach(function (li, idx) {
          li.className = idx < i ? 'is-done' : idx === i ? 'is-active' : '';
        });
        $('#loaderTitle').textContent = steps[i];
        var pct = Math.round(((i + 1) / steps.length) * 92);
        $('#loaderFill').style.width = pct + '%';
        $('#loaderPct').textContent = pct + '%';
        i++;
        setTimeout(tick, 360);
      }
      tick();
    });
  }

  function analyze(query, opts) {
    opts = opts || {};
    query = String(query == null ? ($('#searchInput') || {}).value || '' : query).trim();
    if (!query) {
      toast(t('toastNoProfile'), 'warn');
      focusSearch();
      return;
    }
    state.lastQuery = query;

    $('#results').hidden = true;
    $('#sidebar').hidden = true;
    $('#errorState').hidden = true;
    $('#shell').classList.remove('has-nav');
    clearBattleBackdrop();
    document.body.classList.remove('has-battle-bg');

    if (!API_BASE) {
      showError('offline');
      return;
    }

    var steps = [t('loadStep1'), t('loadStep2'), t('loadStep3'), t('loadStep4')];
    showLoader(steps);

    Promise.all([runLoader(steps), fetchLive(query)]).then(function (res) {
      finishLoad(res[1], query);
    }).catch(function (err) {
      hideLoader();
      if (err && err.kind === 'private') showError('private');
      else if (err && err.kind === 'nokey') showError('nokey');
      else if (err && err.kind === 'http') showError('generic');
      else showError('offline');
    });
  }

  function finishLoad(data, query) {
    hideLoader();
    var payload = hydrate(data);
    var model = buildModel(payload);
    state.model = model;
    state.raw = payload;
    state.source = payload.source;
    state.pickIndex = 0;
    state.year = null;
    state.query = '';
    state.filter = 'all';
    state.compare = null;
    state.duel = { a: null, b: null };

    setProfileBackdrop(model.profile);
    applyAccent((model.quality.best && model.quality.best.accent) || (model.games[0] && model.games[0].accent));
    renderAll();
    $('#results').hidden = false;
    $('#sidebar').hidden = false;
    $('#shell').classList.add('has-nav');
    $('#profileHead').className = 'profile';
    pushHistory(model, query);
    updateUrl();
    updateMeta(model);
    loadFeed();

    try { $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { $('#results').scrollIntoView(); }
  }

  function showError(kind) {
    hideLoader();
    $('#results').hidden = true;
    $('#sidebar').hidden = true;
    $('#shell').classList.remove('has-nav');
    var box = $('#errorState');
    if (!box) return;
    box.hidden = false;
    if (kind === 'private') {
      $('#errorTitle').textContent = t('privateTitle');
      $('#errorSub').textContent = t('privateSub');
      $('.steps').hidden = false;
      $$('.steps li p').forEach(function (p, i) { p.textContent = t('privateStep' + (i + 1)); });
    } else {
      $('#errorTitle').textContent = kind === 'nokey' ? t('errorNoKey') : t('errorTitle');
      $('#errorSub').textContent = kind === 'offline' ? t('errorOffline')
        : kind === 'nokey' ? t('privacyNote') : t('errorGeneric');
      $('.steps').hidden = true;
    }
    try { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { box.scrollIntoView(); }
  }

  function updateUrl() {
    if (!state.model) return;
    var id = state.model.profile.steamid;
    if (!id) return;
    try {
      var url = location.pathname + '?profile=' + encodeURIComponent(id) +
        (state.lang !== 'ru' ? '&lang=' + state.lang : '') +
        (state.cur !== 'RUB' ? '&cur=' + state.cur : '');
      history.replaceState(null, '', url);
    } catch (e) { /* file:// may refuse — harmless */ }
  }

  /* ------------------------------------------------------------------ *
   * 20. history
   * ------------------------------------------------------------------ */

  function pushHistory(m, query) {
    var entry = {
      q: query,
      persona: m.profile.persona || query,
      avatar: m.profile.avatar || '',
      steamid: m.profile.steamid || query,
      ts: Date.now()
    };
    state.history = [entry].concat(state.history.filter(function (h) {
      return h.steamid !== entry.steamid;
    })).slice(0, 6);
    persist();
    renderHistory();
  }

  function renderHistory() {
    var host = $('#historyDropdown');
    if (!host) return;
    if (!state.history.length) {
      host.innerHTML = '<div class="history__head"><span>' + t('historyTitle') + '</span></div>' +
        '<div class="history__empty">' + t('historyEmpty') + '</div>';
      return;
    }
    host.innerHTML = '<div class="history__head"><span>' + t('historyTitle') + '</span>' +
      '<button class="link-btn" type="button" data-action="history-clear">' + t('clearHistory') + '</button></div>' +
      state.history.slice(0, 4).map(function (h, i) {
        return '<button class="history__item" type="button" data-history="' + i + '">' +
          (h.avatar ? '<img src="' + esc(h.avatar) + '" alt="">' : '<span class="history__avatar">' + esc((h.persona || '?').slice(0, 1).toUpperCase()) + '</span>') +
          '<span>' + esc(h.persona) + '</span>' +
          '<small>' + relTime(h.ts) + '</small>' +
          '</button>';
      }).join('');
  }

  function showHistory(force) {
    var host = $('#historyDropdown');
    var input = $('#searchInput');
    if (!host || !input) return;
    if (!force && input.value.trim()) return;
    renderHistory();
    host.hidden = false;
  }

  function hideHistory() {
    var host = $('#historyDropdown');
    if (host) host.hidden = true;
  }

  /* ------------------------------------------------------------------ *
   * 21. small ui actions
   * ------------------------------------------------------------------ */

  function openHint() {
    var pop = $('#hintPop');
    var btn = $('#hintBtn');
    if (!pop) return;
    pop.hidden = false;
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function closeHint() {
    var pop = $('#hintPop');
    var btn = $('#hintBtn');
    if (pop) pop.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function focusSearch() {
    var input = $('#searchInput');
    if (!input) return;
    input.focus();
    input.select();
    showHistory(true);
  }

  function resetToHome() {
    state.model = null;
    state.compare = null;
    state.duel = { a: null, b: null };
    state.source = 'none';
    $('#results').hidden = true;
    $('#sidebar').hidden = true;
    $('#shell').classList.remove('has-nav');
    $('#errorState').hidden = true;
    $('#hero').hidden = false;
    clearBattleBackdrop();
    document.body.classList.remove('has-battle-bg');
    setProfileBackdrop(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    focusSearch();
  }

  function doCompare() {
    if (!state.model) { toast(t('toastNoProfile'), 'warn'); return; }
    var input = $('#rivalInput');
    var q = input ? input.value.trim() : '';
    if (!q) { toast(t('comparePlaceholder'), 'warn'); if (input) input.focus(); return; }
    if (!API_BASE) { toast(t('toastSteamDown'), 'warn'); return; }

    var host = $('#compareResult');
    if (host) host.innerHTML = '<div class="note" style="margin-top:14px">' + esc(t('curatorThinking')) + '</div>';
    fetchLive(q).then(function (data) {
      var rival = buildModel(hydrate(data));
      state.compare = { a: state.model, b: rival };
      renderCompare(state.model, rival);
    }).catch(function () {
      toast(t('toastSteamDown'), 'warn');
      if (host) host.innerHTML = '<div class="note" style="margin-top:14px">' + t('compareNeedFriend') + '</div>';
    });
  }

  /* ------------------------------------------------------------------ *
   * 22. action dispatcher
   * ------------------------------------------------------------------ */

  function handleAction(action, node, ev) {
    switch (action) {
      case 'modal-close':
        closeModal();
        break;
      case 'passport':
        openPassport();
        break;
      case 'download-png':
        downloadPassport();
        break;
      case 'copy-bb':
        var bb = $('#bbCode');
        if (bb) copyText(bb.value, t('copied'));
        break;
      case 'reanalyze':
        analyze(state.lastQuery || (state.model && state.model.profile.persona) || '', {});
        break;
      case 'pick-again':
        state.pickIndex++;
        if (state.model) {
          renderLibrary(state.model);
          runCountUps($('#viewLibrary'));
        }
        break;
      case 'compare':
        doCompare();
        break;
      case 'history-clear':
        state.history = [];
        persist();
        renderHistory();
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------------ *
   * 23. events
   * ------------------------------------------------------------------ */

  function bindEvents() {
    /* news feed: game filter + collapse toggle */
    var feedPick = $('#feedPick');
    if (feedPick) {
      feedPick.addEventListener('change', function () {
        state.feedGame = feedPick.value || '';
        loadFeed();
      });
    }
    var feedToggle = $('#feedToggle');
    if (feedToggle) {
      feedToggle.addEventListener('click', function () {
        state.feedCollapsed = !state.feedCollapsed;
        store('sk_feed_collapsed', state.feedCollapsed ? '1' : '0');
        applyFeedCollapsed();
      });
    }

    /* language + currency */
    $('#langSwitch').addEventListener('click', function (e) {
      var b = e.target.closest('[data-lang]');
      if (b) setLang(b.getAttribute('data-lang'));
    });
    $('#currencySwitch').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cur]');
      if (b) setCurrency(b.getAttribute('data-cur'));
    });

    /* brand */
    $('#brandHome').addEventListener('click', function (e) {
      e.preventDefault();
      resetToHome();
    });

    /* hint */
    $('#hintBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      if ($('#hintPop').hidden) openHint(); else closeHint();
    });
    $('#hintPop').addEventListener('click', function (e) { e.stopPropagation(); });

    /* search */
    $('#searchForm').addEventListener('submit', function (e) {
      e.preventDefault();
      hideHistory();
      analyze($('#searchInput').value);
    });
    $('#searchInput').addEventListener('focus', function () {
      if (!$('#searchInput').value.trim()) showHistory(true);
    });
    $('#searchInput').addEventListener('input', function () {
      if ($('#searchInput').value.trim()) hideHistory();
      else showHistory(true);
    });

    /* error block */
    $('#errorRetry').addEventListener('click', function () {
      analyze(state.lastQuery || '');
    });

    /* primary delegated click */
    document.addEventListener('click', function (e) {
      var friendCmd = e.target.closest('[data-friend-cmd]');
      if (friendCmd) {
        runFriendCommand(friendCmd.getAttribute('data-friend-cmd'));
        return;
      }

      if (e.target.closest('[data-modal]') === e.target && e.target.hasAttribute('data-modal')) {
        closeModal();
        return;
      }

      var histItem = e.target.closest('[data-history]');
      if (histItem) {
        var h = state.history[Number(histItem.getAttribute('data-history'))];
        if (h) {
          hideHistory();
          $('#searchInput').value = h.q;
          analyze(h.q);
        }
        return;
      }

      var hallItem = e.target.closest('[data-steamid]');
      if (hallItem) {
        var sid = hallItem.getAttribute('data-steamid');
        if (sid) {
          $('#searchInput').value = sid;
          analyze(sid);
        }
        return;
      }

      var act = e.target.closest('[data-action]');
      if (act) { handleAction(act.getAttribute('data-action'), act, e); return; }

      var tab = e.target.closest('.side-tab');
      if (tab) { navTo(tab.getAttribute('data-nav')); return; }

      var chip = e.target.closest('[data-filter]');
      if (chip) {
        state.filter = chip.getAttribute('data-filter');
        if (state.model) {
          if (state.view !== 'library') setView('library');
          renderLibrary(state.model);
          runCountUps($('#viewLibrary'));
        }
        return;
      }

      var yearBtn = e.target.closest('[data-year]');
      if (yearBtn) {
        state.year = Number(yearBtn.getAttribute('data-year'));
        if (state.model) { renderLegacy(state.model); runCountUps($('#viewLegacy')); }
        return;
      }

      /* click outside helper popovers */
      if (!e.target.closest('.search')) hideHistory();
      if (!e.target.closest('.hint')) closeHint();
    });

    /* inputs */
    document.addEventListener('input', function (e) {
      var id = e.target.id;
      if (id === 'libSearch') {
        state.query = e.target.value;
        if (state.model) {
          renderLibrary(state.model);
          runCountUps($('#viewLibrary'));
          var again = $('#libSearch');
          if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
        }
        return;
      }
    });

    /* friends: drag into a duel slot, right-click for quick actions */
    document.addEventListener('dragstart', function (e) {
      var item = e.target.closest ? e.target.closest('.friend') : null;
      if (!item) return;
      state.dragFriend = item.getAttribute('data-friend') || '';
      state.dragPersona = item.getAttribute('data-persona') || '';
      state.dragAvatar = item.getAttribute('data-avatar') || '';
      item.classList.add('is-dragging');
      if (e.dataTransfer && state.dragFriend) {
        try {
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData('text/plain', state.dragFriend);
        } catch (err) { /* older browsers */ }
      }
    });

    document.addEventListener('dragover', function (e) {
      if (!state.dragFriend) return;
      var slot = e.target.closest ? e.target.closest('.duel-slot') : null;
      if (!slot) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      slot.classList.add('drag-over');
    });

    document.addEventListener('dragleave', function (e) {
      var slot = e.target.closest ? e.target.closest('.duel-slot') : null;
      if (slot) slot.classList.remove('drag-over');
    });

    document.addEventListener('drop', function (e) {
      var slot = e.target.closest ? e.target.closest('.duel-slot') : null;
      if (!slot) return;
      e.preventDefault();
      var steamid = state.dragFriend || (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '');
      var persona = state.dragPersona;
      var avatar = state.dragAvatar;
      slot.classList.remove('drag-over');
      state.dragFriend = '';
      state.dragPersona = '';
      state.dragAvatar = '';
      if (!steamid) return;
      setDuelSlot(slot.getAttribute('data-slot') || 'b', steamid, persona, avatar);
    });

    document.addEventListener('dragend', function () {
      state.dragFriend = '';
      state.dragPersona = '';
      state.dragAvatar = '';
      $$('.friend.is-dragging').forEach(function (n) { n.classList.remove('is-dragging'); });
      $$('.duel-slot.drag-over').forEach(function (n) { n.classList.remove('drag-over'); });
    });

    /* custom context menu on a friend card */
    document.addEventListener('contextmenu', function (e) {
      var item = e.target.closest ? e.target.closest('.friend') : null;
      if (!item) return;
      var steamid = item.getAttribute('data-friend') || '';
      if (!/^\d{17}$/.test(steamid)) return;
      e.preventDefault();
      openFriendMenu(steamid, item.getAttribute('data-persona') || '', item.getAttribute('data-avatar') || '', e.clientX, e.clientY);
    });

    document.addEventListener('mousedown', function (e) {
      if (!e.target.closest('#friendMenu')) closeFriendMenu();
    });

    window.addEventListener('resize', closeFriendMenu);
    window.addEventListener('scroll', closeFriendMenu, { passive: true });

    /* keyboard */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if ($('#modalRoot').innerHTML.trim()) { closeModal(); return; }
        closeHint();
        hideHistory();
        return;
      }

      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

      if (e.key === '/' && !typing) {
        e.preventDefault();
        focusSearch();
        return;
      }

      if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'rivalInput') {
        e.preventDefault();
        doCompare();
      }
    });

    /* topbar shadow */
    window.addEventListener('scroll', function () {
      var bar = $('#topbar');
      if (bar) bar.classList.toggle('is-stuck', window.scrollY > 12);
    }, { passive: true });
  }

  /* ------------------------------------------------------------------ *
   * 24. bootstrap
   * ------------------------------------------------------------------ */

  function readParams() {
    try {
      var params = new URLSearchParams(location.search);
      var lang = params.get('lang');
      if (lang && ['ru', 'en', 'zh'].indexOf(lang) >= 0) state.lang = lang;
      var cur = params.get('cur');
      if (cur && ['RUB', 'USD', 'CNY'].indexOf(cur) >= 0) state.cur = cur;
      return params.get('profile');
    } catch (e) {
      return null;
    }
  }

  function bootstrap() {
    var profileParam = readParams();
    applyStaticI18n();
    renderHistory();
    bindEvents();
    applyFeedCollapsed();
    loadFeed();
    setInterval(loadFeed, 900000);

    var hintBtn = $('#hintBtn');
    if (hintBtn) hintBtn.setAttribute('aria-expanded', 'false');

    if (profileParam) {
      $('#searchInput').value = profileParam;
      analyze(profileParam, { quiet: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
