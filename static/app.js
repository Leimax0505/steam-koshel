/* =========================================================================
   Steam Koshel — front-end
   Works in two modes:
     1) demo   — open index.html directly, no backend, rich built-in profiles
     2) live   — FastAPI backend on the same origin (/api/...)
   All analytics live here, so both modes render identically.
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

  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return (s >>> 0) / 4294967296;
    };
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
    sampleDemo: ['Демо-профиль', 'Demo profile', '演示档案'],
    sampleEsport: ['Киберспортсмен', 'Esports player', '电竞选手'],
    sampleCollector: ['Коллекционер', 'Collector', '收藏家'],
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
    tryDemo: ['Посмотреть на демо-профиле', 'See a demo profile', '看看演示档案'],
    footerNote: ['Не связан с Valve. Данные — из открытого Steam Web API.',
      'Not affiliated with Valve. Data comes from the public Steam Web API.',
      '与 Valve 无关。数据来自公开的 Steam Web API。'],
    footerDemo: ['Демо-данные', 'Demo data', '演示数据'],

    loadingProfile: ['Ищем профиль…', 'Looking up the profile…', '正在查找档案…'],
    loadStep1: ['Ищем профиль по ссылке или нику', 'Resolving the profile link', '解析资料链接'],
    loadStep2: ['Считаем стоимость библиотеки и инвентаря', 'Pricing the library and inventory', '计算库存与饰品价值'],
    loadStep3: ['Анализируем трофеи, жанры и привычки', 'Reading achievements, genres and habits', '分析成就、类型与习惯'],
    loadStep4: ['Собираем портрет игрока', 'Composing your portrait', '生成玩家画像'],

    liveBadge: ['живые данные Steam', 'live Steam data', 'Steam 实时数据'],
    demoBadge: ['демо-данные', 'demo data', '演示数据'],
    cachedBadge: ['из кэша', 'from cache', '来自缓存'],
    passport: ['Digital Passport', 'Digital Passport', '数字护照'],
    copyLink: ['Скопировать ссылку', 'Copy link', '复制链接'],
    downloadPng: ['Скачать PNG', 'Download PNG', '下载 PNG'],
    copyBB: ['Скопировать BB-код', 'Copy BB code', '复制 BB 代码'],
    copied: ['Скопировано', 'Copied', '已复制'],
    copyFailed: ['Не удалось скопировать — выдели текст вручную', 'Copy failed — select the text manually', '复制失败，请手动选择文本'],

    historyTitle: ['Последние проверки', 'Recent lookups', '最近查看'],
    historyEmpty: ['Здесь появятся профили, которые ты проверишь.', 'Profiles you check will show up here.', '你查看过的档案会出现在这里。'],
    clearHistory: ['Очистить', 'Clear', '清空'],

    oHours: ['Время в играх', 'Hours played', '游戏时长'],
    oGames: ['Игр в библиотеке', 'Games owned', '游戏数量'],
    oValue: ['Стоимость библиотеки', 'Library value', '库价值'],
    oInventory: ['Инвентарь', 'Inventory', '库存饰品'],
    oNever: ['Ни разу не запущено', 'Never launched', '从未启动'],
    oPortfolio: ['Портфель целиком', 'Portfolio total', '总资产'],
    portfolioNote: ['Библиотека по текущим ценам плюс инвентарь.', 'Library at current prices plus inventory.', '按现价计算的游戏库加上库存。'],
    costPerHour: ['Цена одного часа', 'Cost per hour', '每小时成本'],
    costPerHourHint: ['Сколько стоит час твоего удовольствия', 'What an hour of your fun costs', '你的快乐每小时多少钱'],
    saleSavings: ['Сэкономлено на скидках', 'Saved on discounts', '折扣省下'],
    savingsHint: ['Разница между полной ценой и тем, что реально стоит собрать библиотеку сейчас.',
      'The gap between full price and what the library actually costs today.',
      '原价与如今实际入手价的差额。'],

    rankTitle: ['Индекс геймера', 'Gamer index', '玩家指数'],
    rankScore: ['из 100', 'of 100', '满分 100'],
    nextTier: ['до следующего тира', 'to the next tier', '到下一段位'],
    topWorld: ['Топ {n}% в мире', 'Top {n}% worldwide', '全球前 {n}%'],
    aboveAvg: ['Выше среднего на {n}%', '{n}% above average', '高于平均水平 {n}%'],
    belowAvg: ['Ниже среднего на {n}%', '{n}% below average', '低于平均水平 {n}%'],
    tierS: ['Архитектор', 'Architect', '建筑师'],
    tierA: ['Ветеран', 'Veteran', '老兵'],
    tierB: ['Исследователь', 'Explorer', '探索者'],
    tierC: ['Странник', 'Wanderer', '漫游者'],
    tierD: ['Новичок', 'Rookie', '新玩家'],

    curatorTitle: ['AI-куратор', 'AI curator', 'AI 策展人'],
    curatorBadge: ['локальный анализ', 'local analysis', '本地分析'],
    curatorBadgeAi: ['через твой API-ключ', 'via your API key', '使用你的 API 密钥'],
    curatorRefresh: ['Другой ракурс', 'Another angle', '换个角度'],
    curatorThinking: ['Куратор перечитывает библиотеку…', 'The curator is re-reading your library…', '策展人正在重读你的游戏库…'],
    curatorConnect: ['Подключить свой ключ', 'Connect your key', '连接你的密钥'],
    curatorError: ['Внешний ключ не ответил — показываю локальный портрет.', 'The external key did not answer — showing the local portrait.', '外部密钥无响应，显示本地画像。'],

    genreTitle: ['Жанровый компас', 'Genre compass', '类型罗盘'],
    genreSub: ['Куда на самом деле уходит время', 'Where the hours actually go', '时间真正去了哪里'],
    qualityTitle: ['Индекс качества', 'Quality index', '品质指数'],
    qualitySub: ['Средний рейтинг игр в библиотеке', 'Average rating across your games', '库内游戏的平均评分'],
    antiHypeTitle: ['Анти-хайп', 'Anti-hype', '反跟风指数'],
    hypeTrend: ['В тренде', 'On trend', '紧跟潮流'],
    hypeHidden: ['Искатель скрытых шедевров', 'Hidden-gem hunter', '隐藏佳作猎人'],
    hypeBalanced: ['Здоровый баланс', 'Healthy balance', '平衡玩家'],
    avgRating: ['Средняя оценка', 'Average score', '平均分'],
    ratedGames: ['{n} игр с оценкой критиков', '{n} games with critic scores', '{n} 款有媒体评分'],

    fidelityTitle: ['Детектор верности', 'Loyalty detector', '忠诚度检测'],
    loyal: ['Верный специалист', 'Loyal specialist', '忠实专精'],
    explorer: ['Исследователь миров', 'World explorer', '世界探索者'],
    loyalNote: ['{genre} занимает {n}% твоего времени — и это явно осознанный выбор.',
      '{genre} takes {n}% of your time — and that is clearly on purpose.',
      '{genre} 占了你 {n}% 的时间 —— 这显然是深思熟虑的选择。'],
    explorerNote: ['{n} жанров в активе и ни одного, кому отдано больше трети времени.',
      '{n} genres in play, none of them holding more than a third of your hours.',
      '{n} 个类型在玩，没有一个占据超过三分之一的时间。'],

    rhythmTitle: ['Биоритм', 'Rhythm', '生物钟'],
    nightOwl: ['Ночной страж', 'Night watch', '守夜人'],
    dayTact: ['Дневной тактик', 'Day tactician', '白昼战术家'],
    evening: ['Вечерний игрок', 'Evening player', '夜间玩家'],
    rhythmNote: ['Пик активности — около {h}:00. {p}% всех часов приходится на это окно.',
      'Your peak is around {h}:00. {p}% of all hours land in that window.',
      '高峰在 {h}:00 左右。{p}% 的时长集中在这一时段。'],

    pcTitle: ['Прогноз железа', 'Rig forecast', '硬件预测'],
    pcEnthusiast: ['Enthusiast · RTX', 'Enthusiast · RTX', '发烧级 · RTX'],
    pcBalanced: ['Balanced gaming', 'Balanced gaming', '均衡游戏本'],
    pcDeck: ['Steam Deck / ультрабук', 'Steam Deck / ultrabook', 'Steam Deck / 轻薄本'],
    pcNote: ['По самым требовательным играм в библиотеке.', 'Based on the heaviest games you own.', '依据你库里最吃配置的游戏。'],

    cleanTitle: ['Чистота аккаунта', 'Account status', '账号状态'],
    cleanOk: ['Чисто', 'Clean', '清白'],
    cleanWarn: ['Есть отметки', 'Flags found', '存在标记'],
    cleanNote: ['VAC, игровые и торговые блокировки, блокировки сообщества.', 'VAC, game, trade and community bans.', 'VAC、游戏封禁、交易与社区封禁。'],
    noBans: ['Блокировок нет', 'No bans', '无封禁'],

    timeTitle: ['Инвестированное время', 'Time invested', '投入的时间'],
    timeSub: ['{days} дней непрерывной игры', '{days} days of non-stop play', '{days} 天不间断游玩'],
    altTitle: ['Альтернативная реальность', 'Alternative reality', '平行世界'],
    altLanguages: ['языков до уровня B2', 'languages to B2', '门语言达到 B2'],
    altBooks: ['книг по 8 часов', 'books at 8 hours each', '本 8 小时的书'],
    altPilot: ['часов налёта пилота', 'hours of pilot time', '小时飞行时长'],
    altNote: ['Просто арифметика, без осуждения. Время было потрачено с удовольствием — это тоже результат.',
      'Just arithmetic, no judgement. The time was spent enjoying yourself — that counts too.',
      '只是算术，没有评判。这些时间花得开心，也是收获。'],

    backlogTitle: ['Нераскрытый капитал', 'Untapped capital', '未开封的资产'],
    backlogGames: ['{n} игр ждут первого запуска', '{n} games await their first launch', '{n} 款游戏等待首次启动'],
    backlogTime: ['Время на бэклог', 'Backlog time', '通关积压'],
    backlogValue: ['Стоимость нетронутого', 'Value untouched', '未玩价值'],
    backlogNote: ['Оценка по 2 часа в день и средней длине игр в бэклоге.',
      'Estimated at 2 hours a day and the average length of your backlog.',
      '按每天 2 小时与积压游戏的平均时长估算。'],
    days: ['дней', 'days', '天'],
    hoursShort: ['ч', 'h', '小时'],

    saleTitle: ['Симулятор распродажи', 'Sale simulator', '折扣模拟器'],
    saleSlider: ['Средняя скидка', 'Average discount', '平均折扣'],
    saleSave: ['Ты бы сэкономил', 'You would save', '你将省下'],
    salePrice: ['Библиотека обошлась бы в', 'The library would cost', '整个库只需'],
    saleHint: ['Ползунок показывает, сколько стоит собрать эту же библиотеку при другой средней скидке.',
      'The slider shows what the same library would cost at a different average discount.',
      '拖动滑块，看看在另一种平均折扣下，这套库要花多少钱。'],
    roiTitle: ['Окупаемость', 'Break-even', '回本进度'],
    roiNote: ['Сколько часов нужно, чтобы цена часа упала до чашки кофе.',
      'How many hours until an hour costs less than a coffee.',
      '还要玩多久，每小时才比一杯咖啡便宜。'],

    soundTitle: ['Акустический портрет', 'Sound portrait', '声音画像'],
    soundSynthwave: ['Synthwave', 'Synthwave', '合成器浪潮'],
    soundAmbient: ['Ambient', 'Ambient', '氛围'],
    soundOrchestral: ['Orchestral', 'Orchestral', '管弦'],
    soundLofi: ['Lo-Fi', 'Lo-Fi', '低保真'],
    soundNote: ['Настроение собрано из жанров, в которых ты проводишь больше всего времени.',
      'The mood comes from the genres you spend the most time in.',
      '氛围取自你最常投入的类型。'],
    ambientOn: ['Включить эмбиент', 'Play ambient', '播放氛围音'],
    ambientOff: ['Выключить эмбиент', 'Stop ambient', '停止氛围音'],

    libTitle: ['Библиотека под контролем', 'Library, under control', '掌控你的游戏库'],
    libSub: ['Фильтры в один клик, подбор на вечер и очередь запуска.',
      'One-click filters, a pick for tonight and a launch queue.',
      '一键筛选、今晚玩什么，以及启动队列。'],
    filterAll: ['Все', 'All', '全部'],
    filterCoop: ['Кооператив', 'Co-op', '合作'],
    filterWeekend: ['Пройти за выходные', 'Weekend-sized', '周末通关'],
    filterNever: ['Не запускал', 'Never played', '未启动'],
    filterMasterpiece: ['Шедевры 85%+', 'Gems 85%+', '佳作 85+'],
    filterShort: ['До 15 часов', 'Under 15 hours', '15 小时以内'],
    searchGames: ['Поиск по названию', 'Search by title', '按名称搜索'],
    noGames: ['Под эти фильтры пока ничего не подходит.', 'Nothing matches these filters yet.', '没有符合这些筛选条件的游戏。'],
    hoursPlayed: ['{n} ч', '{n} h', '{n} 小时'],
    neverLabel: ['ни разу', 'never', '未玩'],
    smartPick: ['Smart Pick', 'Smart Pick', '智能推荐'],
    smartPickTitle: ['На вечер', 'For tonight', '今晚玩什么'],
    smartPickSub: ['Подобрано по времени, настроению и тому, что давно ждёт.',
      'Chosen by time, mood and what has been waiting too long.',
      '依据时长、心情和等待时间挑选。'],
    pickAgain: ['Ещё вариант', 'Another one', '换一个'],
    addQueue: ['В очередь', 'Add to queue', '加入队列'],
    inQueue: ['В очереди', 'In queue', '已在队列'],
    queueTitle: ['Очередь на вечер', 'Tonight’s queue', '今晚队列'],
    queueEmpty: ['Пусто. Добавь игры кнопкой «В очередь» — очередь сохранится в браузере.',
      'Empty. Add games with “Add to queue” — the queue is saved in your browser.',
      '空。用“加入队列”添加游戏，队列会保存在浏览器里。'],
    playNow: ['Запустить', 'Launch', '启动'],
    remove: ['Убрать', 'Remove', '移除'],
    queueHours: ['{n} ч в очереди', '{n} h queued', '队列共 {n} 小时'],
    weekendBadge: ['выходные', 'weekend', '周末'],
    coopBadge: ['кооп', 'co-op', '合作'],

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
    achievementsWord: ['достижений', 'achievements', '个成就'],
    yearSummary: ['{h} часов · {g} игр', '{h} hours · {g} games', '{h} 小时 · {g} 款游戏'],
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
    metricRank: ['Индекс', 'Index', '指数'],
    compareNeedFriend: ['Демо-режим: подставили один из пресетов. С подключённым бэкендом сравнение идёт по реальному профилю.',
      'Demo mode: we used a preset as the rival. With the backend running this compares real profiles.',
      '演示模式：用预设档案作为对手。连接后端后会对比真实档案。'],

    friendsTitle: ['Идеальный напарник', 'The perfect co-op partner', '完美队友'],
    friendsSub: ['Совместимость по общим несыгранным кооперативным играм', 'Chemistry from shared unplayed co-op games', '基于共同未玩的合作游戏计算契合度'],
    friendsEmpty: ['Список друзей закрыт или пуст.', 'The friend list is private or empty.', '好友列表未公开或为空。'],
    compat: ['совместимость', 'chemistry', '契合度'],
    sharedGames: ['{n} общих игр', '{n} shared games', '{n} 款共同游戏'],
    radarTitle: ['Радар профиля', 'Profile radar', '档案雷达'],
    radarSub: ['Ты и лучший напарник — по шести осям', 'You and your best partner — six axes', '你与最佳队友 —— 六个维度'],
    radarHours: ['Часы', 'Hours', '时长'],
    radarLibrary: ['Библиотека', 'Library', '库'],
    radarTrophies: ['Трофеи', 'Trophies', '成就'],
    radarQuality: ['Качество', 'Quality', '品质'],
    radarSocial: ['Кооп', 'Co-op', '合作'],
    radarLoyalty: ['Верность', 'Loyalty', '专精'],

    wishlistTitle: ['Трекер скидок', 'Wishlist deals', '愿望单折扣'],
    wishlistSub: ['Открытый вишлист и горячие скидки', 'Public wishlist and hot discounts', '公开愿望单与热门折扣'],
    wishlistEmpty: ['Вишлист пуст или закрыт.', 'Wishlist is empty or private.', '愿望单为空或未公开。'],
    wishlistSave: ['Экономия, если забрать всё сейчас', 'Saving if you grab it all now', '现在全部入手可省'],
    discount: ['скидка', 'off', '折扣'],

    hallTitle: ['Зал славы недели', 'Hall of fame, this week', '本周名人堂'],
    hallSub: ['Обезличенные рекорды проверенных профилей', 'Anonymized records from checked profiles', '已检查档案的匿名纪录'],
    hallAnon: ['обезличено', 'anonymized', '已匿名'],

    passportTitle: ['Digital Passport', 'Digital Passport', '数字护照'],
    passportSub: ['Коллекционная карточка профиля. Скачай PNG или вставь BB-код в витрину Steam.',
      'A collectible profile card. Download the PNG or paste the BB code into a Steam showcase.',
      '可收藏的档案卡。下载 PNG，或把 BB 代码贴进 Steam 展柜。'],
    passportSerial: ['Серийный номер', 'Serial', '序列号'],
    passportIssued: ['Выдан', 'Issued', '签发'],
    passportClass: ['Класс', 'Class', '等级'],
    passportDna: ['ДНК игрока', 'Player DNA', '玩家 DNA'],
    passportScan: ['Подлинность подтверждается серийным кодом', 'Authenticity confirmed by the serial code', '以序列号验证真伪'],
    passportFree: ['Коллекционный экземпляр · не для продажи', 'Collectible copy · not for sale', '收藏版本 · 非卖品'],
    passportBB: ['BB-код для витрины', 'BB code for your showcase', '展柜 BB 代码'],
    passportCard: ['Карточка', 'Card', '卡片'],

    settingsTitle: ['Настройки', 'Settings', '设置'],
    settingsAi: ['AI-куратор', 'AI curator', 'AI 策展人'],
    settingsProvider: ['Провайдер', 'Provider', '服务商'],
    settingsKey: ['API-ключ', 'API key', 'API 密钥'],
    settingsKeyHint: ['Ключ хранится только в твоём браузере и уходит напрямую провайдеру.',
      'The key stays in your browser and goes straight to the provider.',
      '密钥只保存在你的浏览器中，直接发送给服务商。'],
    settingsSave: ['Сохранить', 'Save', '保存'],
    settingsClear: ['Удалить ключ', 'Remove key', '删除密钥'],
    settingsSaved: ['Ключ сохранён', 'Key saved', '密钥已保存'],
    settingsCleared: ['Ключ удалён', 'Key removed', '密钥已删除'],

    paletteTitle: ['Команды', 'Commands', '命令'],
    paletteNav: ['навигация', 'navigate', '导航'],
    paletteRun: ['выбрать', 'select', '选择'],
    palettePh: ['Команда, язык, валюта…', 'Command, language, currency…', '命令、语言、货币…'],
    palOverview: ['Показать обзор', 'Show overview', '查看概览'],
    palLibrary: ['Показать библиотеку', 'Show library', '查看游戏库'],
    palLegacy: ['Показать трофеи и историю', 'Show legacy', '查看成就'],
    palSocial: ['Показать сравнение', 'Show social', '查看对比'],
    palLangRu: ['Язык: русский', 'Language: Russian', '语言：俄语'],
    palLangEn: ['Язык: английский', 'Language: English', '语言：英语'],
    palLangZh: ['Язык: китайский', 'Language: Chinese', '语言：中文'],
    palCurRub: ['Валюта: рубль', 'Currency: ruble', '货币：卢布'],
    palCurUsd: ['Валюта: доллар', 'Currency: dollar', '货币：美元'],
    palCurCny: ['Валюта: юань', 'Currency: yuan', '货币：人民币'],
    palAmbient: ['Эмбиент: вкл/выкл', 'Ambient sound: on/off', '氛围音：开/关'],
    palZen: ['Режим скриншота', 'Screenshot mode', '截图模式'],
    palCopy: ['Скопировать ссылку профиля', 'Copy profile link', '复制档案链接'],
    palPassport: ['Открыть Digital Passport', 'Open Digital Passport', '打开数字护照'],
    palSettings: ['Настройки AI-куратора', 'AI curator settings', 'AI 策展人设置'],
    palDemo: ['Переключиться на демо-профиль', 'Load a demo profile', '加载演示档案'],
    palRandom: ['Случайный демо-профиль', 'Random demo profile', '随机演示档案'],
    palTheme: ['Сменить акцент', 'Shuffle accent', '切换强调色'],
    palSearch: ['Найти профиль', 'Look up a profile', '查找档案'],
    palHint: ['Как найти ссылку на профиль', 'How to find the profile link', '如何找到资料链接'],

    toastDemo: ['Открыт демо-режим: бэкенд не запущен, данные встроенные.',
      'Demo mode: the backend is off, so built-in data is used.', '演示模式：后端未启动，使用内置数据。'],
    toastSteamDown: ['Steam не ответил — показываю кэш. Попробуй через минуту.',
      'Steam did not answer — showing cached data. Try again in a minute.',
      'Steam 无响应 —— 显示缓存数据，请稍后再试。'],
    toastCopied: ['Ссылка скопирована', 'Link copied', '链接已复制'],
    toastQueued: ['Добавлено в очередь на вечер', 'Added to tonight’s queue', '已加入今晚队列'],
    toastUnqueued: ['Убрано из очереди', 'Removed from the queue', '已从队列移除'],
    toastQueueSaved: ['Очередь хранится в браузере', 'The queue is stored in your browser', '队列保存在浏览器中'],
    toastAmbient: ['Эмбиент включён', 'Ambient on', '氛围音已开启'],
    toastAmbientOff: ['Эмбиент выключен', 'Ambient off', '氛围音已关闭'],
    toastZen: ['Режим скриншота: Ctrl+K вернёт управление', 'Screenshot mode: Ctrl+K brings controls back', '截图模式：Ctrl+K 恢复控制'],
    toastAccent: ['Акцент взят с обложки любимой игры', 'Accent taken from your top game cover', '强调色取自最爱游戏的封面'],
    toastNoProfile: ['Сначала проверь профиль', 'Analyze a profile first', '请先分析一个档案'],

    noData: ['Нет данных', 'No data', '无数据'],
    gamesWord: ['игр', 'games', '款游戏'],
    ofLibrary: ['библиотеки', 'of the library', '的游戏库'],
    today: ['сегодня', 'today', '今天'],
    openInSteam: ['Открыть в Steam', 'Open in Steam', '在 Steam 中打开'],
    scoreOutOf: ['{n} / 10', '{n} / 10', '{n} / 10'],
    playersShare: ['игроков', 'of players', '的玩家'],
    free: ['Бесплатно', 'Free', '免费'],
    itemsWord: ['предметов', 'items', '件'],
    friendsWord: ['друзей', 'friends', '位好友'],
    sinceWord: ['в Steam с', 'on Steam since', '加入 Steam 于'],
    genresWord: ['жанров', 'genres', '个类型'],
    bestOf: ['Лучшее', 'Best', '最佳'],
    groupNav: ['Навигация', 'Navigation', '导航'],
    groupProfile: ['Профиль', 'Profile', '档案'],
    groupLang: ['Язык', 'Language', '语言'],
    groupCur: ['Валюта', 'Currency', '货币'],
    groupView: ['Вид', 'View', '视图']
  };

  var I18N = { ru: {}, en: {}, zh: {} };
  Object.keys(STRINGS).forEach(function (k) {
    I18N.ru[k] = STRINGS[k][0];
    I18N.en[k] = STRINGS[k][1];
    I18N.zh[k] = STRINGS[k][2];
  });

  var LOCALES = { ru: 'ru-RU', en: 'en-US', zh: 'zh-CN' };

  function t(key, vars) {
    var s = (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || key;
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
    queue: store('sk_queue') || [],
    history: store('sk_history') || [],
    model: null,
    raw: null,
    source: 'none',
    zen: false,
    aiKey: store('sk_ai_key') || '',
    aiProvider: store('sk_ai_provider') || 'openai',
    ambient: false,
    pick: null,
    compare: null,
    portraitIndex: 0
  };

  if (!Array.isArray(state.history)) state.history = [];
  if (!Array.isArray(state.queue)) state.queue = [];
  state.queue = state.queue.map(Number).filter(function (n) { return !isNaN(n); });

  function persist() {
    store('sk_lang', state.lang);
    store('sk_cur', state.cur);
    store('sk_queue', state.queue);
    store('sk_history', state.history);
  }

  /* ------------------------------------------------------------------ *
   * 4. demo data — three rich, believable profiles
   *    row: [appid, name, hours, hours2w, genres, metacritic, priceUSD,
   *          discount%, year, unlocked, total, lastYear, weight, tags, delisted]
   * ------------------------------------------------------------------ */

  var DEMO_RAW = [
    {
      preset: 'demo',
      profile: {
        steamid: '76561198014242111',
        persona: 'NeonDrifter',
        realname: 'Артём К.',
        level: 87,
        country: 'RU',
        created: Date.UTC(2011, 5, 14),
        online: true,
        bans: { vac: 0, game: 0, trade: 0, community: 0 },
        friends: 132,
        avatar: ''
      },
      games: [
        [1091500, 'Cyberpunk 2077', 312, 0, 'RPG,Action', 86, 59.99, 50, 2020, 34, 45, 2025, 4, 'story,open'],
        [1245620, 'Elden Ring', 208, 6, 'RPG,Action', 96, 59.99, 30, 2022, 31, 42, 2026, 5, 'story,hard'],
        [1086940, "Baldur's Gate 3", 288, 9, 'RPG,Strategy', 96, 59.99, 10, 2023, 24, 54, 2026, 4, 'story,coop,gem'],
        [292030, 'The Witcher 3', 164, 0, 'RPG,Adventure', 93, 39.99, 75, 2015, 52, 78, 2024, 3, 'story,gem'],
        [1145360, 'Hades', 121, 0, 'Action,Indie', 93, 24.99, 50, 2020, 47, 49, 2025, 2, 'roguelike,gem,short'],
        [632470, 'Disco Elysium', 62, 0, 'RPG,Indie', 91, 39.99, 70, 2019, 18, 45, 2024, 1, 'story,gem'],
        [367520, 'Hollow Knight', 78, 0, 'Indie,Adventure', 90, 14.99, 50, 2017, 61, 63, 2023, 1, 'hard,gem,short'],
        [504230, 'Celeste', 34, 0, 'Indie,Platformer', 91, 19.99, 60, 2018, 30, 32, 2023, 1, 'hard,short,gem'],
        [782330, 'DOOM Eternal', 39, 0, 'Action,FPS', 88, 39.99, 75, 2020, 22, 50, 2024, 3, 'fast'],
        [594650, 'Hunt: Showdown', 96, 4, 'Action,FPS', 81, 39.99, 60, 2019, 14, 37, 2026, 4, 'coop,multi'],
        [892970, 'Valheim', 87, 0, 'Indie,Survival', 84, 19.99, 40, 2021, 21, 45, 2025, 2, 'coop,open'],
        [548430, 'Deep Rock Galactic', 64, 3, 'Action,FPS', 85, 29.99, 67, 2020, 33, 69, 2026, 2, 'coop,multi'],
        [1426210, 'It Takes Two', 14, 0, 'Adventure,Coop', 89, 39.99, 60, 2021, 9, 20, 2024, 2, 'coop,short'],
        [413150, 'Stardew Valley', 112, 2, 'Indie,Simulation', 89, 14.99, 20, 2016, 38, 40, 2026, 1, 'coop,relax'],
        [427520, 'Factorio', 156, 0, 'Strategy,Simulation', 90, 35.0, 0, 2020, 44, 88, 2025, 2, 'long,hard'],
        [526870, 'Satisfactory', 71, 0, 'Simulation,Indie', 88, 29.99, 20, 2020, 18, 44, 2025, 4, 'coop,long'],
        [632360, 'Risk of Rain 2', 58, 0, 'Action,Indie', 85, 24.99, 50, 2020, 31, 58, 2024, 2, 'coop,roguelike'],
        [753640, 'Outer Wilds', 27, 0, 'Adventure,Indie', 85, 24.99, 40, 2019, 12, 31, 2023, 1, 'story,gem'],
        [653530, 'Return of the Obra Dinn', 11, 0, 'Indie,Puzzle', 89, 19.99, 50, 2018, 16, 18, 2023, 1, 'story,short'],
        [1092790, 'Inscryption', 21, 0, 'Indie,Strategy', 85, 19.99, 50, 2021, 14, 34, 2024, 1, 'story,roguelike'],
        [1983990, 'SIGNALIS', 0, 0, 'Indie,Horror', 86, 19.99, 40, 2022, 0, 13, 0, 1, 'never,short,horror'],
        [1353230, 'Bomb Rush Cyberfunk', 0, 0, 'Indie,Action', 83, 39.99, 40, 2023, 0, 32, 0, 1, 'never'],
        [553420, 'TUNIC', 0, 0, 'Indie,Adventure', 85, 29.99, 50, 2022, 0, 36, 0, 1, 'never,short'],
        [757310, 'Sable', 0, 0, 'Indie,Adventure', 80, 24.99, 75, 2021, 0, 48, 0, 1, 'never'],
        [1205520, 'Pentiment', 0, 0, 'RPG,Adventure', 86, 19.99, 50, 2022, 0, 16, 0, 1, 'never,story'],
        [1326470, 'Sons of the Forest', 0, 0, 'Action,Survival', 82, 29.99, 40, 2023, 0, 28, 0, 3, 'never,coop']
      ],
      inventory: [
        { name: 'AK-47 | Slate (Field-Tested)', game: 'CS2', price: 14.5 },
        { name: 'Glock-18 | Water Elemental', game: 'CS2', price: 9.2 },
        { name: 'Vintage Timebreaker', game: 'Dota 2', price: 44.0 }
      ],
      achievements: {
        first: { name: 'Начало пути', game: 'The Witcher 3', rarity: 71.2, date: Date.UTC(2015, 4, 19) },
        rarest: [
          { name: 'Radahn, покорённый в одиночку', game: 'Elden Ring', rarity: 0.8, icon: '★' },
          { name: 'Путь боли', game: 'Hollow Knight', rarity: 1.4, icon: '⚔' },
          { name: 'Идеальный забег', game: 'Celeste', rarity: 2.1, icon: '✦' }
        ]
      },
      yearly: [
        { y: 2016, h: 96, g: 6 }, { y: 2017, h: 118, g: 5 }, { y: 2018, h: 142, g: 7 },
        { y: 2019, h: 176, g: 6 }, { y: 2020, h: 288, g: 9 }, { y: 2021, h: 246, g: 8 },
        { y: 2022, h: 312, g: 7 }, { y: 2023, h: 268, g: 11 }, { y: 2024, h: 204, g: 6 },
        { y: 2025, h: 296, g: 8 }, { y: 2026, h: 138, g: 5 }
      ],
      wishlist: [
        { name: 'Hollow Knight: Silksong', price: 19.99, discount: 0, year: 2026 },
        { name: 'Ghost of Tsushima', price: 59.99, discount: 40, year: 2024 },
        { name: 'Lies of P', price: 49.99, discount: 55, year: 2023 },
        { name: 'Dragon\'s Dogma 2', price: 69.99, discount: 30, year: 2024 },
        { name: 'Pacific Drive', price: 24.99, discount: 45, year: 2024 }
      ],
      friends: [
        { steamid: '76561198000000021', persona: 'Ksenia', hours: 1180, shared: ['Baldur\'s Gate 3', 'Deep Rock Galactic'], avatar: '' },
        { steamid: '76561198000000022', persona: 'v1ktor', hours: 2410, shared: ['Deep Rock Galactic', 'Satisfactory', 'Valheim'], avatar: '' },
        { steamid: '76561198000000023', persona: 'sleepy_owl', hours: 640, shared: ['It Takes Two'], avatar: '' },
        { steamid: '76561198000000024', persona: 'Mira', hours: 3200, shared: ['Baldur\'s Gate 3', 'Risk of Rain 2', 'Valheim'], avatar: '' }
      ]
    },
    {
      preset: 'esport',
      profile: {
        steamid: '76561198823771002',
        persona: 'AWP_Sasha',
        realname: 'Саша В.',
        level: 133,
        country: 'RU',
        created: Date.UTC(2013, 1, 2),
        online: true,
        bans: { vac: 0, game: 0, trade: 0, community: 0 },
        friends: 208,
        avatar: ''
      },
      games: [
        [730, 'Counter-Strike 2', 3180, 14, 'Action,FPS', 83, 0, 0, 2023, 41, 41, 2026, 2, 'multi,fast'],
        [570, 'Dota 2', 1640, 8, 'Strategy,RPG', 82, 0, 0, 2013, 22, 132, 2026, 2, 'multi,long'],
        [578080, 'PUBG: BATTLEGROUNDS', 420, 0, 'Action,FPS', 73, 0, 0, 2017, 18, 37, 2025, 3, 'multi'],
        [1172470, 'Apex Legends', 380, 0, 'Action,FPS', 79, 0, 0, 2020, 26, 12, 2025, 3, 'multi,fast'],
        [359550, 'Rainbow Six Siege', 210, 0, 'Action,FPS', 79, 19.99, 60, 2015, 31, 60, 2024, 2, 'multi'],
        [252490, 'Rust', 148, 0, 'Action,Survival', 76, 39.99, 50, 2018, 14, 90, 2024, 3, 'multi,coop'],
        [252950, 'Rocket League', 96, 0, 'Sports,Racing', 86, 0, 0, 2015, 34, 88, 2025, 1, 'multi,fast'],
        [271590, 'Grand Theft Auto V', 88, 0, 'Action,Adventure', 92, 29.99, 55, 2015, 22, 77, 2023, 3, 'story,multi'],
        [2073850, 'The Finals', 64, 2, 'Action,FPS', 82, 0, 0, 2023, 12, 50, 2026, 3, 'multi,fast'],
        [240, 'Counter-Strike: Source', 62, 0, 'Action,FPS', 88, 9.99, 0, 2004, 12, 45, 2020, 1, 'multi'],
        [550, 'Left 4 Dead 2', 74, 0, 'Action,FPS', 89, 9.99, 80, 2009, 42, 65, 2024, 1, 'coop'],
        [440, 'Team Fortress 2', 132, 0, 'Action,FPS', 80, 0, 0, 2007, 34, 520, 2023, 1, 'multi,coop'],
        [553850, 'HELLDIVERS 2', 88, 5, 'Action,Coop', 82, 39.99, 20, 2024, 19, 38, 2026, 3, 'coop,multi'],
        [1085660, 'Destiny 2', 210, 0, 'Action,RPG', 85, 0, 0, 2019, 28, 23, 2025, 3, 'multi,coop'],
        [1599340, 'Lost Ark', 240, 0, 'RPG,Action', 76, 0, 0, 2022, 16, 44, 2024, 3, 'multi,long'],
        [1245620, 'Elden Ring', 34, 0, 'RPG,Action', 96, 59.99, 30, 2022, 9, 42, 2023, 5, 'story,hard'],
        [1091500, 'Cyberpunk 2077', 22, 0, 'RPG,Action', 86, 59.99, 50, 2020, 6, 45, 2023, 4, 'story,open'],
        [1422450, 'Deadlock', 40, 3, 'Action,Strategy', 0, 0, 0, 2024, 0, 0, 2026, 3, 'multi,early']
      ],
      inventory: [
        { name: '★ Karambit | Doppler (Factory New)', game: 'CS2', price: 1240.0 },
        { name: 'AWP | Asiimov (Field-Tested)', game: 'CS2', price: 185.0 },
        { name: 'M4A1-S | Printstream (Minimal Wear)', game: 'CS2', price: 210.0 },
        { name: 'AK-47 | Redline (Field-Tested)', game: 'CS2', price: 42.0 }
      ],
      achievements: {
        first: { name: 'Первая кровь', game: 'Counter-Strike: Source', rarity: 64.8, date: Date.UTC(2013, 1, 9) },
        rarest: [
          { name: 'Global Elite', game: 'Counter-Strike 2', rarity: 0.6, icon: '★' },
          { name: 'AWP-мастер', game: 'Counter-Strike 2', rarity: 1.1, icon: '◎' },
          { name: 'На вершине', game: 'Dota 2', rarity: 0.9, icon: '▲' }
        ]
      },
      yearly: [
        { y: 2016, h: 420, g: 4 }, { y: 2017, h: 610, g: 6 }, { y: 2018, h: 720, g: 5 },
        { y: 2019, h: 880, g: 6 }, { y: 2020, h: 1020, g: 8 }, { y: 2021, h: 940, g: 5 },
        { y: 2022, h: 780, g: 7 }, { y: 2023, h: 860, g: 9 }, { y: 2024, h: 690, g: 8 },
        { y: 2025, h: 610, g: 6 }, { y: 2026, h: 320, g: 5 }
      ],
      wishlist: [
        { name: 'Counter-Strike 2 Prime', price: 14.99, discount: 0, year: 2023 },
        { name: 'Black Myth: Wukong', price: 59.99, discount: 25, year: 2024 },
        { name: 'Delta Force', price: 0, discount: 0, year: 2024 },
        { name: 'S.T.A.L.K.E.R. 2', price: 59.99, discount: 35, year: 2024 }
      ],
      friends: [
        { steamid: '76561198000000031', persona: 'n0scope', hours: 4200, shared: ['Counter-Strike 2', 'Dota 2', 'HELLDIVERS 2'], avatar: '' },
        { steamid: '76561198000000032', persona: 'Lera', hours: 1600, shared: ['HELLDIVERS 2', 'Left 4 Dead 2'], avatar: '' },
        { steamid: '76561198000000033', persona: 'Tarik', hours: 2900, shared: ['Counter-Strike 2', 'The Finals'], avatar: '' },
        { steamid: '76561198000000034', persona: 'mochi', hours: 980, shared: ['Rocket League'], avatar: '' }
      ]
    },
    {
      preset: 'collector',
      profile: {
        steamid: '76561197960287930',
        persona: 'Archive_Keeper',
        realname: 'Игорь М.',
        level: 412,
        country: 'KZ',
        created: Date.UTC(2004, 8, 22),
        online: false,
        bans: { vac: 0, game: 0, trade: 0, community: 0 },
        friends: 64,
        avatar: ''
      },
      games: [
        [292030, 'The Witcher 3', 244, 0, 'RPG,Adventure', 93, 39.99, 75, 2015, 78, 78, 2021, 3, 'story,gem'],
        [367520, 'Hollow Knight', 112, 0, 'Indie,Adventure', 90, 14.99, 50, 2017, 63, 63, 2022, 1, 'hard,gem'],
        [504230, 'Celeste', 58, 0, 'Indie,Platformer', 91, 19.99, 60, 2018, 32, 32, 2022, 1, 'hard,short,gem'],
        [413150, 'Stardew Valley', 320, 0, 'Indie,Simulation', 89, 14.99, 20, 2016, 40, 40, 2025, 1, 'coop,relax'],
        [105600, 'Terraria', 268, 0, 'Indie,Adventure', 83, 9.99, 50, 2011, 88, 88, 2023, 1, 'coop,open'],
        [322330, "Don't Starve Together", 190, 0, 'Indie,Survival', 84, 14.99, 60, 2016, 34, 36, 2024, 2, 'coop'],
        [289070, 'Sid Meier’s Civilization VI', 210, 0, 'Strategy,Simulation', 88, 59.99, 85, 2016, 80, 120, 2023, 2, 'long'],
        [1086940, "Baldur's Gate 3", 180, 0, 'RPG,Strategy', 96, 59.99, 10, 2023, 50, 54, 2025, 4, 'story,coop,gem'],
        [620, 'Portal 2', 34, 0, 'Puzzle,Adventure', 95, 9.99, 80, 2011, 51, 51, 2019, 1, 'story,short,gem'],
        [400, 'Portal', 18, 0, 'Puzzle,Adventure', 90, 9.99, 80, 2007, 15, 15, 2018, 1, 'short,gem'],
        [220, 'Half-Life 2', 46, 0, 'Action,FPS', 96, 9.99, 80, 2004, 69, 69, 2018, 1, 'story,gem'],
        [70, 'Half-Life', 38, 0, 'Action,FPS', 96, 9.99, 80, 1998, 25, 25, 2017, 1, 'story,gem'],
        [546560, 'Half-Life: Alyx', 22, 0, 'Action,Adventure', 93, 59.99, 60, 2020, 42, 42, 2021, 5, 'story,vr'],
        [632470, 'Disco Elysium', 74, 0, 'RPG,Indie', 91, 39.99, 70, 2019, 45, 45, 2022, 1, 'story,gem'],
        [1145360, 'Hades', 96, 0, 'Action,Indie', 93, 24.99, 50, 2020, 49, 49, 2023, 2, 'roguelike,gem'],
        [1091500, 'Cyberpunk 2077', 144, 0, 'RPG,Action', 86, 59.99, 50, 2020, 44, 45, 2024, 4, 'story,open'],
        [1174180, 'Red Dead Redemption 2', 208, 0, 'Action,Adventure', 97, 59.99, 67, 2019, 48, 51, 2023, 5, 'story,open,gem'],
        [1245620, 'Elden Ring', 132, 0, 'RPG,Action', 96, 59.99, 30, 2022, 42, 42, 2024, 5, 'story,hard'],
        [271590, 'Grand Theft Auto V', 96, 0, 'Action,Adventure', 92, 29.99, 55, 2015, 60, 77, 2020, 3, 'story'],
        [1551360, 'Forza Horizon 5', 84, 0, 'Racing,Simulation', 92, 59.99, 50, 2021, 62, 124, 2023, 4, 'racing,open'],
        [251570, '7 Days to Die', 88, 0, 'Survival,Action', 74, 24.99, 60, 2013, 22, 43, 2022, 3, 'coop'],
        [227300, 'Euro Truck Simulator 2', 340, 0, 'Simulation,Racing', 79, 19.99, 75, 2012, 32, 87, 2026, 2, 'relax,long'],
        [255710, 'Cities: Skylines', 164, 0, 'Simulation,Strategy', 85, 29.99, 75, 2015, 44, 80, 2022, 2, 'long'],
        [281990, 'Stellaris', 148, 0, 'Strategy,Simulation', 80, 39.99, 75, 2016, 38, 100, 2023, 2, 'long'],
        [8930, 'Sid Meier’s Civilization V', 220, 0, 'Strategy,Simulation', 90, 29.99, 75, 2010, 96, 286, 2019, 2, 'long'],
        [224060, 'Deadpool', 0, 0, 'Action,Adventure', 74, 39.99, 0, 2013, 0, 50, 0, 1, 'never,delisted'],
        [42640, 'Blur', 24, 0, 'Racing,Action', 81, 19.99, 0, 2010, 18, 40, 2019, 1, 'delisted'],
        [3970, 'Prey (2006)', 18, 0, 'Action,FPS', 83, 19.99, 0, 2006, 12, 44, 2018, 1, 'delisted'],
        [108710, 'Alan Wake', 46, 0, 'Action,Horror', 83, 29.99, 0, 2010, 55, 67, 2020, 2, 'delisted,story'],
        [200260, 'Saints Row IV', 0, 0, 'Action,Adventure', 86, 19.99, 0, 2013, 0, 47, 0, 2, 'never,delisted']
      ],
      inventory: [
        { name: 'Genuine Golden Professor Speks', game: 'TF2', price: 96.0 },
        { name: 'Vintage Lugermorph', game: 'TF2', price: 58.0 },
        { name: 'Steam Treasure Hunt 2019 Pack', game: 'Steam', price: 24.0 }
      ],
      achievements: {
        first: { name: 'Добро пожаловать в City 17', game: 'Half-Life 2', rarity: 58.4, date: Date.UTC(2005, 1, 11) },
        rarest: [
          { name: 'Последний рыцарь', game: 'Hollow Knight', rarity: 0.3, icon: '♜' },
          { name: 'Ритуал Розы', game: 'Hollow Knight', rarity: 0.7, icon: '✧' },
          { name: 'Без единой смерти', game: 'Celeste', rarity: 0.4, icon: '✦' }
        ]
      },
      yearly: [
        { y: 2016, h: 210, g: 12 }, { y: 2017, h: 268, g: 14 }, { y: 2018, h: 316, g: 11 },
        { y: 2019, h: 402, g: 16 }, { y: 2020, h: 520, g: 18 }, { y: 2021, h: 610, g: 15 },
        { y: 2022, h: 560, g: 21 }, { y: 2023, h: 640, g: 17 }, { y: 2024, h: 488, g: 13 },
        { y: 2025, h: 396, g: 11 }, { y: 2026, h: 142, g: 7 }
      ],
      wishlist: [
        { name: 'Hollow Knight: Silksong', price: 19.99, discount: 0, year: 2026 },
        { name: 'Pentiment', price: 19.99, discount: 50, year: 2022 },
        { name: 'Return of the Obra Dinn', price: 19.99, discount: 50, year: 2018 },
        { name: 'Tunic', price: 29.99, discount: 50, year: 2022 },
        { name: 'Animal Well', price: 24.99, discount: 20, year: 2024 },
        { name: 'Lorelei and the Laser Eyes', price: 24.99, discount: 30, year: 2024 }
      ],
      friends: [
        { steamid: '76561198000000041', persona: 'curator_ilya', hours: 5200, shared: ['The Witcher 3', 'Baldur\'s Gate 3'], avatar: '' },
        { steamid: '76561198000000042', persona: 'Sasha Archive', hours: 3100, shared: ['Hollow Knight', 'Celeste', 'Hades'], avatar: '' },
        { steamid: '76561198000000043', persona: 'kot_begemot', hours: 890, shared: ['Stardew Valley'], avatar: '' },
        { steamid: '76561198000000044', persona: 'Nadya', hours: 2400, shared: ['Baldur\'s Gate 3', 'Don\'t Starve Together', 'Stardew Valley'], avatar: '' }
      ]
    }
  ];

  /* ------------------------------------------------------------------ *
   * 5. normalisation
   * ------------------------------------------------------------------ */

  var TAGS = { never: 1, coop: 1, short: 1, gem: 1, delisted: 1, long: 1, hard: 1, multi: 1 };

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
      delisted: !!row[14] || !!tagSet.delisted,
      cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/' + row[0] + '/header.jpg',
      accent: accentFor(row[0])
    };
  }

  var ACCENTS = ['#7C5CFF', '#55E6C8', '#F5B544', '#FF6B7A', '#4EA8FF', '#C084FC', '#34D399', '#FB923C'];

  function accentFor(seed) {
    return ACCENTS[hash31(String(seed)) % ACCENTS.length];
  }

  function demoRaw(index) {
    var d = DEMO_RAW[index % DEMO_RAW.length];
    return {
      source: 'demo',
      preset: d.preset,
      profile: d.profile,
      games: d.games.map(normaliseGame),
      inventory: d.inventory.slice(),
      achievements: d.achievements,
      yearly: d.yearly.slice(),
      wishlist: d.wishlist.slice(),
      friends: d.friends.map(function (f) {
        return { steamid: f.steamid, persona: f.persona, hours: f.hours, shared: f.shared.slice(), avatar: f.avatar || '' };
      })
    };
  }

  /* ------------------------------------------------------------------ *
   * 6. analytics — one engine for demo and live payloads
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

  var PC_TIERS = [
    { key: 'deck', min: 0, label: 'pcDeck' },
    { key: 'balanced', min: 3.1, label: 'pcBalanced' },
    { key: 'enthusiast', min: 4.35, label: 'pcEnthusiast' }
  ];

  function tierForScore(score) {
    if (score >= 88) return { key: 'S', label: 'tierS', min: 88, next: 100 };
    if (score >= 72) return { key: 'A', label: 'tierA', min: 72, next: 88 };
    if (score >= 55) return { key: 'B', label: 'tierB', min: 55, next: 72 };
    if (score >= 38) return { key: 'C', label: 'tierC', min: 38, next: 55 };
    return { key: 'D', label: 'tierD', min: 0, next: 38 };
  }

  function buildModel(raw) {
    var games = raw.games.map(function (g) { return g; });
    var profile = raw.profile || {};
    var seed = hash31(String(profile.steamid || profile.persona || 'steam'));
    var rand = rng(seed);

    var totalGames = games.length;
    var hours = sum(games, function (g) { return g.hours; });
    var played = games.filter(function (g) { return g.hours > 0.5; });
    var never = games.filter(function (g) { return g.hours <= 0.5; });

    var fullValue = sum(games, function (g) { return g.price; });
    var saleValue = sum(games, function (g) { return g.salePrice; });
    var inventory = (raw.inventory || []).slice().sort(function (a, b) { return b.price - a.price; });
    var invValue = sum(inventory, function (i) { return i.price; });
    var portfolio = saleValue + invValue;

    /* genres by hours */
    var genreMap = {};
    games.forEach(function (g) {
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

    /* rhythm */
    var hourly = raw.hourly && raw.hourly.length === 24 ? raw.hourly.slice() : makeRhythm(raw.preset || profile.steamid, hours, rand);
    var peakHour = hourly.indexOf(Math.max.apply(null, hourly));
    var nightShare = sum([22, 23, 0, 1, 2, 3].map(function (h) { return hourly[h]; })) / (sum(hourly) || 1);
    var rhythmLabel = (peakHour >= 21 || peakHour <= 4) ? 'nightOwl'
      : (peakHour >= 9 && peakHour <= 17) ? 'dayTact' : 'evening';
    var peakShare = Math.round((hourly[peakHour] / (sum(hourly) || 1)) * 100);

    /* rig */
    var heavy = played.slice().sort(function (a, b) { return b.weight - a.weight; }).slice(0, 5);
    var rigScore = heavy.length ? sum(heavy, function (g) { return g.weight; }) / heavy.length : 0;
    var rigTier = PC_TIERS[0];
    PC_TIERS.forEach(function (p) { if (rigScore >= p.min) rigTier = p; });

    /* account */
    var bans = profile.bans || {};
    var banCount = (bans.vac || 0) + (bans.game || 0) + (bans.trade || 0) + (bans.community || 0);

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

    /* backlog */
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

    /* wishlist */
    var wishlist = (raw.wishlist || []).slice();
    var wishSave = sum(wishlist, function (w) { return w.price * (w.discount / 100); });
    var wishDiscounted = wishlist.filter(function (w) { return w.discount > 0; });

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

    /* rank */
    var hoursScore = clamp(Math.sqrt(hours / 9000) * 100, 0, 100);
    var gamesScore = clamp((Math.log10(1 + totalGames) / Math.log10(900)) * 100, 0, 100);
    var qualityScore = avgMc || 62;
    var moneyScore = clamp((Math.log10(1 + portfolio) / Math.log10(9000)) * 100, 0, 100);
    var achScore = achTotal ? clamp(achRatio * 100 * 1.35, 0, 100) : 24;

    var score = Math.round(
      hoursScore * 0.29 + gamesScore * 0.17 + achScore * 0.19 +
      qualityScore * 0.17 + moneyScore * 0.13 + (banCount ? 0 : 100) * 0.05
    );
    score = clamp(score, 1, 100);
    var tier = tierForScore(score);
    var tierProgress = tier.next === 100 ? 100 : Math.round(((score - tier.min) / (tier.next - tier.min)) * 100);

    var topWorld = clamp(Math.round(100 * Math.exp(-(score - 35) / 16)), 1, 99);
    var avgHours = 320;
    var vsAverage = Math.round((hours / avgHours - 1) * 100);

    function topPctFor(value, anchor) {
      if (!value) return 99;
      return clamp(Math.round(100 / (1 + Math.pow(value / anchor, 2.2))), 1, 99);
    }

    /* sound */
    var mood = soundFor(topGenre.name, genres);

    var model = {
      source: raw.source || 'demo',
      preset: raw.preset || '',
      profile: profile,
      games: games,
      inventory: inventory,
      genres: genres,
      topGenre: topGenre,
      top3Share: top3Share,
      friends: friends,
      wishlist: wishlist,
      wishSave: wishSave,
      wishDiscounted: wishDiscounted,
      yearly: yearly,
      hourly: hourly,
      peakHour: peakHour,
      peakShare: peakShare,
      nightShare: nightShare,
      rhythmLabel: rhythmLabel,
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
        achievements: achUnlocked
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
      fidelity: {
        loyal: top3Share >= 0.62,
        label: top3Share >= 0.62 ? 'loyal' : 'explorer',
        share: Math.round(top3Share * 100)
      },
      rig: {
        key: rigTier.key,
        label: rigTier.label,
        score: round(rigScore, 2)
      },
      account: {
        bans: banCount,
        clean: banCount === 0,
        label: banCount === 0 ? 'cleanOk' : 'cleanWarn'
      },
      rank: {
        score: score,
        tier: tier,
        progress: tierProgress,
        topWorld: topWorld,
        vsAverage: vsAverage,
        parts: [
          { key: 'hours', v: Math.round(hoursScore), anchor: 320, top: topPctFor(hours, 320) },
          { key: 'games', v: Math.round(gamesScore), anchor: 45, top: topPctFor(totalGames, 45) },
          { key: 'value', v: Math.round(moneyScore), anchor: 420, top: topPctFor(portfolio, 420) }
        ]
      },
      sound: mood,
      alt: {
        languages: Math.max(0, Math.floor(hours / 600)),
        books: Math.floor(hours / 8),
        pilot: Math.round(hours * 0.72)
      },
      updates: []
    };

    model.score = score;
    return model;
  }

  function makeRhythm(preset, hours, rand) {
    var biasMap = { demo: 22, esport: 20, collector: 15 };
    var center = biasMap[preset] != null ? biasMap[preset] : 18 + Math.floor(rand() * 8);
    var out = [];
    for (var h = 0; h < 24; h++) {
      var dist = Math.min(Math.abs(h - center), 24 - Math.abs(h - center));
      var base = Math.exp(-(dist * dist) / 17);
      var wobble = 0.55 + rand() * 0.9;
      out.push(Math.max(0.04, base * wobble));
    }
    var s = sum(out) || 1;
    return out.map(function (v) { return round((v / s) * (hours || 100), 1); });
  }

  function soundFor(topGenre, genres) {
    var names = genres.map(function (g) { return g.name; });
    if (names.indexOf('Horror') >= 0) return { mood: 'ambient', label: 'soundAmbient' };
    if (names.indexOf('RPG') >= 0 || names.indexOf('Adventure') >= 0) {
      if (topGenre.name === 'RPG' || topGenre.name === 'Strategy') return { mood: 'orchestral', label: 'soundOrchestral' };
    }
    if (names.indexOf('FPS') >= 0 || names.indexOf('Action') >= 0) return { mood: 'synthwave', label: 'soundSynthwave' };
    if (names.indexOf('Simulation') >= 0 || names.indexOf('Strategy') >= 0) return { mood: 'ambient', label: 'soundAmbient' };
    return { mood: 'lofi', label: 'soundLofi' };
  }

  /* portrait text — templated per language, so it reads like a person wrote it */
  var PORTRAIT_TEMPLATES = {
    ru: [
      function (m) {
        return 'Ты из тех, кто покупает игру не ради галочки, а ради вечера внутри неё. ' +
          genreName(m.topGenre.name) + ' съедает ' + Math.round(m.topGenre.share * 100) + '% твоего времени — ' +
          (m.fidelity.loyal ? 'и это не случайность, а осознанная верность жанру.' : 'но библиотека всё равно шире одной полки.') +
          ' Средний час обошёлся тебе в ' + money(m.money.costPerHour, { digits: 1 }) + ', и это честная цена за ' +
          num(m.totals.hours) + ' часов, которые уже не отнять.';
      },
      function (m) {
        return 'Судя по профилю, ты ценишь плотность впечатлений: ' + (m.quality.best ? '«' + m.quality.best.name + '»' : 'топовые проекты') +
          ' и средняя оценка ' + m.quality.index.toFixed(1) + '/10 говорят сами за себя. ' +
          'При этом ' + m.backlog.games + ' игр всё ещё ждут первого запуска — ' +
          (m.backlog.games > 4 ? 'это не провал, это стратегический запас на скучные времена.' : 'и это подозрительно дисциплинированно.');
      },
      function (m) {
        return 'Твой ритм — ' + t(m.rhythmLabel).toLowerCase() + ': пик около ' + m.peakHour + ':00, ' +
          Math.round(m.nightShare * 100) + '% часов приходятся на поздние окна. ' +
          'Железо, судя по самым тяжёлым играм, тянет уровень «' + t(m.rig.label) + '». ' +
          (m.account.clean ? 'Аккаунт чистый — ни VAC, ни блокировок.' : 'Есть отметки в истории аккаунта — стоит проверить.');
      }
    ],
    en: [
      function (m) {
        return 'You buy games for the evening inside them, not for a checkbox. ' +
          genreName(m.topGenre.name) + ' takes ' + Math.round(m.topGenre.share * 100) + '% of your time — ' +
          (m.fidelity.loyal ? 'and that is deliberate loyalty, not an accident.' : 'yet the library is clearly wider than one shelf.') +
          ' An average hour cost you ' + money(m.money.costPerHour, { digits: 1 }) + ', which is fair for ' +
          num(m.totals.hours) + ' hours nobody can take away.';
      },
      function (m) {
        return 'Your profile says you care about density: ' + (m.quality.best ? '“' + m.quality.best.name + '”' : 'the heavy hitters') +
          ' and a ' + m.quality.index.toFixed(1) + '/10 average make the point. ' +
          'Meanwhile ' + m.backlog.games + ' games are still waiting for their first launch — ' +
          (m.backlog.games > 4 ? 'not a failure, a strategic reserve for dull evenings.' : 'which is suspiciously disciplined.');
      },
      function (m) {
        return 'Your rhythm reads as ' + t(m.rhythmLabel).toLowerCase() + ': peak around ' + m.peakHour + ':00, ' +
          Math.round(m.nightShare * 100) + '% of hours in the late window. ' +
          'The heaviest titles suggest a rig in the “' + t(m.rig.label) + '” class. ' +
          (m.account.clean ? 'The account is clean — no VAC, no bans.' : 'There are flags on the account history worth checking.');
      }
    ],
    zh: [
      function (m) {
        return '你买游戏不是为了打勾，而是为了在里面度过一个晚上。' +
          genreName(m.topGenre.name) + '占了你 ' + Math.round(m.topGenre.share * 100) + '% 的时间——' +
          (m.fidelity.loyal ? '这不是偶然，而是对类型的忠诚。' : '但你的库显然不止一个货架。') +
          ' 平均每小时花了你 ' + money(m.money.costPerHour, { digits: 1 }) + '，对于已经拥有的 ' +
          num(m.totals.hours) + ' 小时来说，这价钱很公道。';
      },
      function (m) {
        return '从档案看，你在意密度：' + (m.quality.best ? '《' + m.quality.best.name + '》' : '那些重量级作品') +
          ' 和 ' + m.quality.index.toFixed(1) + '/10 的平均分已经说明了。' +
          '同时还有 ' + m.backlog.games + ' 款游戏等待第一次启动——' +
          (m.backlog.games > 4 ? '这不是失败，是给无聊夜晚准备的战略储备。' : '这份自律有点可疑。');
      },
      function (m) {
        return '你的节奏像' + t(m.rhythmLabel) + '：高峰在 ' + m.peakHour + ':00 左右，' +
          Math.round(m.nightShare * 100) + '% 的时长落在深夜。' +
          '从最吃配置的游戏看，你的机器大致是「' + t(m.rig.label) + '」级别。' +
          (m.account.clean ? '账号很干净——没有 VAC，也没有封禁。' : '账号历史里有标记，值得检查一下。');
      }
    ]
  };

  function localPortrait(m, index) {
    var list = PORTRAIT_TEMPLATES[state.lang] || PORTRAIT_TEMPLATES.en;
    return list[index % list.length](m);
  }

  /* ------------------------------------------------------------------ *
   * 7. compare helper
   * ------------------------------------------------------------------ */

  function duelRows(a, b) {
    return [
      { label: 'metricHours', a: a.totals.hours, b: b.totals.hours, fmt: 'hours' },
      { label: 'metricGames', a: a.totals.games, b: b.totals.games, fmt: 'int' },
      { label: 'metricValue', a: a.money.portfolio, b: b.money.portfolio, fmt: 'money' },
      { label: 'metricAch', a: a.achievements.unlocked, b: b.achievements.unlocked, fmt: 'int' },
      { label: 'metricRank', a: a.rank.score, b: b.rank.score, fmt: 'int' }
    ];
  }

  function radarAxes(m) {
    return [
      { label: 'radarHours', v: clamp(Math.sqrt(m.totals.hours / 4000) * 100, 6, 100) },
      { label: 'radarLibrary', v: clamp((m.totals.games / 60) * 100, 6, 100) },
      { label: 'radarTrophies', v: clamp(m.achievements.ratio * 140, 4, 100) },
      { label: 'radarQuality', v: clamp(m.quality.avgMc, 10, 100) },
      { label: 'radarSocial', v: clamp(m.friends.length * 18 + 12, 8, 100) },
      { label: 'radarLoyalty', v: clamp(m.fidelity.share + 10, 10, 100) }
    ];
  }

  /* ------------------------------------------------------------------ *
   * 8. render primitives
   * ------------------------------------------------------------------ */

  function topPct(value, anchor) {
    if (!value) return 99;
    return clamp(Math.round(100 / (1 + Math.pow(value / anchor, 2.2))), 1, 99);
  }

  function fmtBy(kind, v) {
    if (kind === 'money') return money(v, { digits: Math.abs(v) < 100 ? 2 : 0 });
    if (kind === 'money1') return money(v, { digits: 1 });
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

  function stat(span, label, value, delta, foot, cls) {
    return '<section class="card ' + (cls || '') + ' s' + span + '">' +
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

  function avatarHtml(url, name, cls) {
    var initials = esc((name || '?').slice(0, 1).toUpperCase());
    if (url) return '<img src="' + esc(url) + '" alt="" onerror="this.parentNode.innerHTML=\'<span>' + initials + '</span>\'">';
    return '<span>' + initials + '</span>';
  }

  /* ------------------------------------------------------------------ *
   * 9. profile header + overview
   * ------------------------------------------------------------------ */

  function renderProfile(m) {
    var p = m.profile;
    var badge = '';
    if (m.source === 'live') badge = '<span class="badge badge--good">' + t('liveBadge') + '</span>';
    else if (m.source === 'cache') badge = '<span class="badge badge--warn">' + t('cachedBadge') + '</span>';
    else badge = '<span class="badge badge--accent">' + t('demoBadge') + '</span>';

    var initials = esc((p.persona || '?').slice(0, 1).toUpperCase());
    var ava = p.avatar
      ? '<img src="' + esc(p.avatar) + '" alt="" onerror="this.style.display=\'none\'">'
      : '';
    var joined = p.created ? dateStr(p.created) : '—';

    return '' +
      '<div class="profile__avatar">' + ava + '<span>' + initials + '</span>' +
      '<i class="profile__dot ' + (p.online ? 'is-online' : '') + '"></i></div>' +
      '<div class="profile__main">' +
      '<h2 class="profile__name">' + esc(p.persona || 'Steam') + badge + '</h2>' +
      '<div class="profile__sub">' +
      (p.realname ? '<span>' + esc(p.realname) + '</span><span class="sep">·</span>' : '') +
      '<span>Steam ID ' + esc(p.steamid) + '</span>' +
      (p.level ? '<span class="sep">·</span><span>Level ' + p.level + '</span>' : '') +
      (p.country ? '<span class="sep">·</span><span>' + esc(p.country) + '</span>' : '') +
      (p.friends ? '<span class="sep">·</span><span>' + num(p.friends) + ' ' + t('friendsWord') + '</span>' : '') +
      '<span class="sep">·</span><span>' + t('sinceWord') + ' ' + joined + '</span>' +
      '</div></div>' +
      '<div class="profile__rank">' +
      '<div class="rank">' +
      '<div class="rank__letter">' + m.rank.tier.key + '</div>' +
      '<div><div class="rank__label">' + t(m.rank.tier.label) + '</div>' +
      '<div class="rank__score">' + m.rank.score + ' ' + t('rankScore') + '</div></div>' +
      '</div>' +
      '<span class="badge badge--accent">' + t('topWorld', { n: m.rank.topWorld }) + '</span>' +
      '</div>' +
      '<div class="profile__actions">' +
      '<button class="btn btn--primary" type="button" data-action="passport">' +
      '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="3.4" width="12" height="9.2" rx="2" stroke="currentColor" stroke-width="1.3"/><circle cx="5.8" cy="7.2" r="1.3" stroke="currentColor" stroke-width="1.1"/><path d="M4 10.8c.5-1 1.1-1.5 1.8-1.5s1.3.5 1.8 1.5M9.6 6.6h2.8M9.6 9.2h2.8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>' +
      t('passport') + '</button>' +
      '<button class="btn btn--ghost" type="button" data-action="copy-link">' + t('copyLink') + '</button>' +
      '<button class="btn btn--ghost" type="button" data-action="reanalyze">' + t('retry') + '</button>' +
      '<span class="profile__source"><i></i>' + (m.source === 'live' ? t('liveBadge') : m.source === 'cache' ? t('cachedBadge') : t('demoBadge')) + '</span>' +
      '</div>';
  }

  function renderOverview(m) {
    var acc = m.account;
    var dir = m.rank.vsAverage >= 0 ? 'up' : 'down';
    var html = '';

    html += stat(3, t('oHours'),
      count(0, m.totals.hours, 'int') + '<small>' + t('hoursShort') + '</small>',
      '<span class="stat__delta stat__delta--accent">' + t('topWorld', { n: topPct(m.totals.hours, 320) }) + '</span>' +
      '<span class="stat__delta stat__delta--' + dir + '">' + (m.rank.vsAverage >= 0 ? '+' : '') + m.rank.vsAverage + '%</span>',
      t('timeSub', { days: num(m.totals.days) }));

    html += stat(3, t('oGames'),
      count(0, m.totals.games, 'int'),
      '<span class="stat__delta stat__delta--accent">' + t('topWorld', { n: topPct(m.totals.games, 45) }) + '</span>' +
      '<span class="stat__delta stat__delta--neutral">' + m.totals.played + ' ' + t('ofLibrary') + '</span>',
      t('topWorld', { n: topPct(m.totals.games, 45) }));

    html += stat(3, t('oPortfolio'),
      count(0, m.money.portfolio, 'money'),
      '<span class="stat__delta stat__delta--accent">' + t('topWorld', { n: topPct(m.money.portfolio, 420) }) + '</span>',
      money(m.money.sale) + ' ' + t('ofLibrary') + ' + ' + money(m.money.inventory));

    html += stat(3, t('oInventory'),
      count(0, m.money.inventory, 'money'),
      '<span class="stat__delta stat__delta--neutral">' + m.inventory.length + ' ' + t('itemsWord') + '</span>',
      m.inventory.length ? esc(m.inventory[0].name) : t('noData'));

    /* rank */
    html += card({
      span: 5,
      title: t('rankTitle'),
      hint: t('nextTier') + ' · ' + t(m.rank.tier.label),
      aside: '<span class="badge badge--' + (m.rank.tier.key === 'S' ? 'gold' : 'accent') + '">Tier ' + m.rank.tier.key + '</span>',
      body:
        '<div style="display:flex;align-items:flex-end;gap:10px;margin-bottom:4px">' +
        '<div class="stat__value" style="font-size:52px">' + count(0, m.rank.score, 'int') + '</div>' +
        '<div class="muted tiny" style="padding-bottom:10px">' + t('rankScore') + '</div>' +
        '</div>' +
        progress(m.rank.progress) +
        '<div class="progress__caption"><span>' + m.rank.score + ' / 100</span><span>' + t(m.rank.tier.label) + '</span></div>' +
        '<div class="row" style="margin-top:14px">' +
        '<span class="badge badge--accent">' + t('topWorld', { n: m.rank.topWorld }) + '</span>' +
        '<span class="badge">' + t(m.rank.vsAverage >= 0 ? 'aboveAvg' : 'belowAvg', { n: Math.abs(m.rank.vsAverage) }) + '</span>' +
        '</div>',
      foot: '<span class="tiny">' + t('savingsHint') + '</span>'
    });

    /* curator */
    html += card({
      span: 7,
      title: t('curatorTitle'),
      hint: state.aiKey ? t('curatorBadgeAi') : t('curatorBadge'),
      aside: '<span class="badge badge--good">AI</span>',
      body: '<div id="curatorText" style="display:flex;flex-direction:column;gap:10px;font-size:13.5px;line-height:1.65;color:var(--text-soft)">' +
        '<p>' + esc(localPortrait(m, state.portraitIndex)) + '</p>' +
        '<p class="muted" style="font-size:12.5px">' + esc(localPortrait(m, state.portraitIndex + 1)) + '</p>' +
        '</div>',
      foot: '<button class="btn btn--ghost btn--sm" type="button" data-action="curator-refresh">' + t('curatorRefresh') + '</button>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-action="open-settings">' + t('curatorConnect') + '</button>'
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

    /* quality */
    html += card({
      span: 3,
      title: t('qualityTitle'),
      hint: t('qualitySub'),
      body: '<div class="stat__value">' + m.quality.index.toFixed(1) + '<small>/10</small></div>' +
        progress(m.quality.avgMc) +
        '<div class="progress__caption"><span>' + t('avgRating') + ' ' + m.quality.avgMc + '</span><span>' + t('ratedGames', { n: m.quality.rated }) + '</span></div>' +
        '<div class="row" style="margin-top:14px"><span class="badge badge--accent">' + t(m.quality.hypeLabel) + '</span></div>',
      foot: m.quality.best ? '<span class="tiny">Top: ' + esc(m.quality.best.name) + ' · ' + m.quality.best.metacritic + '</span>' : ''
    });

    /* rhythm */
    var maxH = Math.max.apply(null, m.hourly) || 1;
    html += card({
      span: 4,
      title: t('rhythmTitle'),
      hint: t(m.rhythmLabel),
      aside: '<span class="badge">' + m.peakHour + ':00</span>',
      body: '<div class="rhythm">' + m.hourly.map(function (v, i) {
        return '<span class="rhythm__col ' + (i === m.peakHour ? 'is-peak' : '') + '"><i style="height:' + Math.max(3, Math.round((v / maxH) * 100)) + '%"></i></span>';
      }).join('') + '</div>' +
        '<div class="rhythm__scale"><span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>' +
        '<p class="tiny muted" style="margin-top:10px">' + t('rhythmNote', { h: m.peakHour, p: m.peakShare }) + '</p>'
    });

    /* fidelity */
    html += card({
      span: 4,
      title: t('fidelityTitle'),
      hint: t('loyal') + ' / ' + t('explorer'),
      body: '<div class="stat__value" style="font-size:26px">' + t(m.fidelity.label) + '</div>' +
        progress(m.fidelity.share) +
        '<div class="progress__caption"><span>top-3 genres</span><span>' + m.fidelity.share + '%</span></div>' +
        '<p class="tiny muted" style="margin-top:12px;line-height:1.6">' +
        (m.fidelity.loyal
          ? t('loyalNote', { genre: esc(genreName(m.topGenre.name)), n: Math.round(m.topGenre.share * 100) })
          : t('explorerNote', { n: m.genres.filter(function (g) { return g.share > 0.05; }).length })) +
        '</p>'
    });

    /* rig + account */
    html += card({
      span: 4,
      title: t('pcTitle'),
      hint: t('pcNote'),
      body: '<div class="stat__value" style="font-size:24px">' + t(m.rig.label) + '</div>' +
        '<div class="row" style="margin-top:6px">' +
        [1, 2, 3, 4, 5].map(function (i) {
          return '<span style="width:26px;height:5px;border-radius:999px;background:' +
            (m.rig.score >= i - 0.4 ? 'var(--accent)' : 'rgba(255,255,255,0.08)') + '"></span>';
        }).join('') +
        '</div>' +
        '<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)">' +
        '<div class="row" style="justify-content:space-between">' +
        '<span class="stat__label">' + t('cleanTitle') + '</span>' +
        '<span class="badge badge--' + (acc.clean ? 'good' : 'bad') + '">' + t(acc.label) + '</span></div>' +
        '<p class="tiny muted" style="margin-top:8px">' + (acc.clean ? t('noBans') : 'VAC / Game / Trade / Community: ' + acc.bans) + '</p>' +
        '</div>'
    });

    /* time + alt */
    var altMode = state.altMode || 'languages';
    var altValue = altMode === 'books' ? m.alt.books : altMode === 'pilot' ? m.alt.pilot : m.alt.languages;
    var altLabel = altMode === 'books' ? t('altBooks') : altMode === 'pilot' ? t('altPilot') : t('altLanguages');
    html += card({
      span: 4,
      title: t('timeTitle'),
      hint: t('timeSub', { days: num(m.totals.days) }),
      body: '<div class="stat__value">' + count(0, m.totals.hours, 'int') + '<small>' + t('hoursShort') + '</small></div>' +
        '<div class="switch" style="margin-top:12px" data-alt-switch>' +
        '<button type="button" data-alt="languages" class="' + (altMode === 'languages' ? 'is-active' : '') + '">' + t('altLanguages') + '</button>' +
        '<button type="button" data-alt="books" class="' + (altMode === 'books' ? 'is-active' : '') + '">' + t('altBooks') + '</button>' +
        '<button type="button" data-alt="pilot" class="' + (altMode === 'pilot' ? 'is-active' : '') + '">' + t('altPilot') + '</button>' +
        '</div>' +
        '<div class="stat__value" style="font-size:22px;margin-top:10px">' + num(altValue) + '</div>' +
        '<p class="tiny muted" style="margin-top:10px">' + t('altNote') + '</p>'
    });

    /* portfolio / sale */
    html += card({
      span: 6,
      title: t('oValue'),
      hint: t('portfolioNote'),
      aside: '<span class="badge badge--good">−' + m.money.savingsPct + '%</span>',
      body:
        '<div class="row" style="gap:18px;flex-wrap:wrap">' +
        '<div><div class="tiny muted">' + t('oValue') + '</div><div class="stat__value" style="font-size:26px">' + money(m.money.sale) + '</div></div>' +
        '<div><div class="tiny muted">' + t('saleSavings') + '</div><div class="stat__value" style="font-size:26px;color:var(--accent-2)">' + money(m.money.savings) + '</div></div>' +
        '<div><div class="tiny muted">' + t('costPerHour') + '</div><div class="stat__value" style="font-size:26px">' + money(m.money.costPerHour, { digits: 2 }) + '</div></div>' +
        '</div>' +
        '<div style="margin-top:16px">' +
        '<div class="row" style="justify-content:space-between;margin-bottom:6px"><span class="tiny muted">' + t('saleSlider') + '</span><span class="tiny strong" id="salePct">50%</span></div>' +
        '<input class="slider" type="range" min="0" max="90" value="50" step="5" id="saleSlider" aria-label="discount">' +
        '<div class="row" style="justify-content:space-between;margin-top:10px">' +
        '<span class="tiny muted">' + t('salePrice') + ' <b id="salePrice" style="color:var(--text)">' + money(m.money.full * 0.5) + '</b></span>' +
        '<span class="tiny muted">' + t('saleSave') + ' <b id="saleSave" style="color:var(--accent-2)">' + money(m.money.full * 0.5) + '</b></span>' +
        '</div></div>' +
        '<div class="metric" style="margin-top:12px"><span>' + t('costPerHourHint') + '</span><b>' + money(m.money.portfolio) + '</b></div>',
      foot: '<span class="tiny">' + t('savingsHint') + '</span>'
    });

    /* backlog */
    html += card({
      span: 6,
      title: t('backlogTitle'),
      hint: t('backlogGames', { n: m.backlog.games }),
      aside: '<span class="badge badge--warn">' + money(m.backlog.value) + '</span>',
      body: '<div class="row" style="gap:24px;flex-wrap:wrap;margin-bottom:14px">' +
        '<div><div class="tiny muted">' + t('backlogTime') + '</div><div class="stat__value" style="font-size:26px">' + num(Math.round(m.backlog.hours)) + ' <small>' + t('hoursShort') + '</small></div></div>' +
        '<div><div class="tiny muted">' + t('days') + '</div><div class="stat__value" style="font-size:26px">' + num(m.backlog.days) + '</div></div>' +
        '<div><div class="tiny muted">' + t('backlogValue') + '</div><div class="stat__value" style="font-size:26px">' + money(m.backlog.value) + '</div></div>' +
        '</div>' +
        progress(Math.round((m.totals.never / (m.totals.games || 1)) * 100), 'progress--thin') +
        '<div class="progress__caption"><span>' + m.totals.never + ' / ' + m.totals.games + '</span><span>' + Math.round((m.totals.never / (m.totals.games || 1)) * 100) + '%</span></div>',
      foot: '<span class="tiny">' + t('backlogNote') + '</span>'
    });

    /* wishlist */
    html += card({
      span: 5,
      title: t('wishlistTitle'),
      hint: t('wishlistSub'),
      aside: m.wishDiscounted.length ? '<span class="badge badge--good">' + m.wishDiscounted.length + ' ' + t('discount') + '</span>' : '',
      body: m.wishlist.length ? '<div class="games">' + m.wishlist.slice(0, 4).map(function (w) {
        return '<div class="game" style="grid-template-columns:1fr auto">' +
          '<div><div class="game__name">' + esc(w.name) + '</div>' +
          '<div class="game__meta"><span>' + w.year + '</span><span class="dot"></span><span>' + (w.price ? money(w.price) : t('free')) + '</span></div></div>' +
          '<div class="game__hours">' + (w.discount ? '<span class="stat__delta stat__delta--up">−' + w.discount + '%</span>' : '<small>' + t('noData') + '</small>') + '</div>' +
          '</div>';
      }).join('') + '</div>' : '<div class="empty"><span class="empty__icon">♡</span>' + t('wishlistEmpty') + '</div>',
      foot: m.wishSave > 0 ? '<span class="tiny">' + t('wishlistSave') + ': <b style="color:var(--accent-2)">' + money(m.wishSave) + '</b></span>' : ''
    });

    /* sound */
    html += card({
      span: 4,
      title: t('soundTitle'),
      hint: t('soundNote'),
      aside: '<span class="badge">' + t(m.sound.label) + '</span>',
      body: '<div class="stat__value" style="font-size:26px">' + t(m.sound.label) + '</div>' +
        '<div class="rhythm" style="height:44px;margin-top:12px;align-items:center;gap:4px">' +
        [0.4, 0.7, 0.35, 0.9, 0.55, 0.8, 0.3, 0.65, 0.45, 0.85, 0.5, 0.75].map(function (v, i) {
          return '<span style="flex:1;height:' + Math.round(v * 100) + '%;border-radius:2px;background:color-mix(in srgb,var(--accent) ' + (30 + i * 5) + '%, transparent)"></span>';
        }).join('') + '</div>' +
        '<button class="btn btn--ghost btn--block" type="button" data-action="ambient" style="margin-top:14px"' + (state.ambient ? ' data-on="1"' : '') + '>' +
        (state.ambient ? t('ambientOff') : t('ambientOn')) + '</button>'
    });

    /* passport promo */
    html += card({
      span: 3,
      title: t('passportTitle'),
      hint: t('passportSub'),
      cls: 'card--accent',
      body: '<div style="display:grid;place-items:center;height:70px;font-size:44px;letter-spacing:-0.04em;font-weight:800;color:rgba(255,255,255,0.9)">' + m.rank.tier.key + '</div>' +
        '<div class="tiny muted center">' + t('passportSerial') + ' · ' + serialFor(m) + '</div>',
      foot: '<button class="btn btn--primary btn--sm btn--block" type="button" data-action="passport">' + t('passport') + '</button>'
    });

    $('#viewOverview').innerHTML = '<div class="bento">' + html + '</div>';
  }

  function serialFor(m) {
    var h = hash31(String(m.profile.steamid) + m.totals.hours + m.rank.score).toString(36).toUpperCase();
    while (h.length < 7) h = '0' + h;
    return 'SK-' + h.slice(0, 4) + '-' + h.slice(4, 7);
  }

  /* ------------------------------------------------------------------ *
   * 10. library
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
    var never = m.games.filter(function (g) { return g.hours <= 0.5; });
    var pool = never.length ? never : m.games.filter(function (g) { return g.hours > 0 && g.hours < 30; });
    if (!pool.length) pool = m.games.slice();
    if (!pool.length) return null;
    var scored = pool.map(function (g) {
      var s = (g.metacritic || 62) + (g.tags.short ? 12 : 0) + (g.tags.coop ? 7 : 0) +
        (g.hours <= 0.5 ? 18 : 0) - g.weight * 2.5 - Math.min(20, g.hours / 12);
      return { g: g, s: s };
    }).sort(function (a, b) { return b.s - a.s; });
    return scored[state.pickIndex % scored.length].g;
  }

  function inQueue(id) { return state.queue.indexOf(id) >= 0; }

  function renderLibrary(m) {
    var list = gamesFor(m);
    var pick = pickGame(m);
    var queueGames = state.queue.map(function (id) {
      return m.games.filter(function (g) { return g.appid === id; })[0];
    }).filter(Boolean);
    var queueHours = sum(queueGames, function (g) { return g.hours; });

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

    /* smart pick */
    if (pick) html += card({
      span: 5,
      title: t('smartPickTitle'),
      hint: t('smartPickSub'),
      cls: 'card--glow',
      aside: '<span class="badge badge--accent">Smart Pick</span>',
      body: '<div style="display:flex;gap:12px;align-items:center">' +
        '<span style="flex:0 0 auto;width:104px;height:49px;border-radius:10px;overflow:hidden;background:linear-gradient(140deg,#24202f,#171a20);position:relative">' +
        '<img src="' + esc(pick.cover) + '" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'">' +
        '</span>' +
        '<div style="min-width:0"><div class="game__name" style="font-size:14px">' + esc(pick.name) + '</div>' +
        '<div class="game__meta"><span>' + esc(genreName(pick.genres[0] || '—')) + '</span>' +
        (pick.metacritic ? '<span class="dot"></span><span class="game__mc ' + mcClass(pick.metacritic) + '">' + pick.metacritic + '</span>' : '') +
        '<span class="dot"></span><span>' + (pick.hours <= 0.5 ? t('neverLabel') : hoursLabel(pick.hours)) + '</span></div></div>' +
        '</div>' +
        '<div class="row" style="margin-top:14px">' +
        '<button class="btn btn--primary btn--sm" type="button" data-action="queue-add" data-appid="' + pick.appid + '">' +
        (inQueue(pick.appid) ? t('inQueue') : t('addQueue')) + '</button>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-action="pick-again">' + t('pickAgain') + '</button>' +
        '<a class="btn btn--ghost btn--sm" href="steam://run/' + pick.appid + '">' + t('playNow') + '</a>' +
        '</div>',
      foot: '<span class="tiny">' + (pick.tags.coop ? t('coopBadge') + ' · ' : '') + (pick.tags.short ? t('weekendBadge') : t('ofLibrary')) + '</span>'
    });

    /* queue */
    html += card({
      span: 7,
      title: t('queueTitle'),
      hint: queueGames.length ? t('queueHours', { n: num(Math.round(queueHours)) }) : t('queueEmpty'),
      aside: '<span class="badge">' + state.queue.length + '</span>',
      body: queueGames.length ? '<div class="games">' + queueGames.map(function (g) {
        return '<div class="game">' + gameCover(g) +
          '<div style="min-width:0"><div class="game__name">' + esc(g.name) + '</div>' +
          '<div class="game__meta"><span>' + hoursLabel(g.hours) + '</span><span class="dot"></span><span>' + money(g.salePrice) + '</span></div></div>' +
          '<div class="game__actions">' +
          '<a class="icon-btn" href="steam://run/' + g.appid + '" title="' + t('playNow') + '">▶</a>' +
          '<button class="icon-btn" type="button" data-action="queue-remove" data-appid="' + g.appid + '" title="' + t('remove') + '">✕</button>' +
          '</div></div>';
      }).join('') + '</div>' : '<div class="empty"><span class="empty__icon">☾</span>' + t('queueEmpty') + '</div>',
      foot: '<button class="btn btn--ghost btn--sm" type="button" data-action="queue-clear">' + t('remove') + '</button>'
    });

    /* all games */
    html += card({
      span: 12,
      title: t('libTitle'),
      hint: list.length + ' ' + t('gamesWord'),
      aside: '<span class="badge">' + t('filterAll') + ' · ' + m.games.length + '</span>',
      body: list.length ? '<div class="games">' + list.map(function (g) {
        return '<div class="game">' + gameCover(g) +
          '<div style="min-width:0">' +
          '<div class="game__name">' + esc(g.name) + (g.delisted ? '<em>DELISTED</em>' : '') + '</div>' +
          '<div class="game__meta">' +
          '<span>' + esc(genreName(g.genres[0] || '—')) + '</span>' +
          (g.metacritic ? '<span class="dot"></span><span class="game__mc ' + mcClass(g.metacritic) + '">' + g.metacritic + '</span>' : '') +
          (g.year ? '<span class="dot"></span><span>' + g.year + '</span>' : '') +
          '<span class="dot"></span><span>' + (g.price ? money(g.salePrice) : 'Free') + '</span>' +
          (g.tags.coop ? '<span class="dot"></span><span class="badge" style="padding:1px 6px">' + t('coopBadge') + '</span>' : '') +
          '</div></div>' +
          '<div class="game__actions">' +
          '<span class="game__hours">' + (g.hours > 0.5 ? num(Math.round(g.hours)) + ' ' + t('hoursShort') : t('neverLabel')) +
          (g.hours2w ? '<small>+' + num(Math.round(g.hours2w)) + ' / 2w</small>' : '') + '</span>' +
          '<button class="icon-btn ' + (inQueue(g.appid) ? 'is-on' : '') + '" type="button" data-action="queue-add" data-appid="' + g.appid + '" title="' + t('addQueue') + '">' +
          '<svg viewBox="0 0 16 16" fill="none"><path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>' +
          '<a class="icon-btn" href="steam://run/' + g.appid + '" title="' + t('playNow') + '">' +
          '<svg viewBox="0 0 16 16" fill="none"><path d="M5 3.6 12.2 8 5 12.4V3.6Z" fill="currentColor"/></svg></a>' +
          '</div></div>';
      }).join('') + '</div>' : '<div class="empty"><span class="empty__icon">∅</span>' + t('noGames') + '</div>'
    });

    $('#viewLibrary').innerHTML = '<div class="bento">' + html + '</div>';
  }

  /* ------------------------------------------------------------------ *
   * 11. legacy
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
      foot: '<span class="tiny">' + Math.round(a.ratio * 100) + '% ' + t('achievementsWord') + ' · ' + a.done.length + ' × 100%</span>'
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

    /* capsule */
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
   * 12. social
   * ------------------------------------------------------------------ */

  function renderSocial(m) {
    var best = m.friends[0] || null;
    var html = '';

    html += card({
      span: 12,
      title: t('socialCompareTitle'),
      hint: t('socialCompareSub'),
      body:
        '<div class="compare-inputs">' +
        '<div class="field"><label>' + t('compareYou') + '</label>' +
        '<input class="input" id="cmpA" value="' + esc(m.profile.persona || '') + '" readonly></div>' +
        '<div class="duel__vs" style="margin-bottom:4px">VS</div>' +
        '<div class="field"><label>' + t('compareFriend') + '</label>' +
        '<input class="input" id="cmpB" placeholder="' + t('comparePlaceholder') + '"></div>' +
        '</div>' +
        '<div class="row" style="margin-top:12px">' +
        '<button class="btn btn--primary btn--sm" type="button" data-action="compare">' + t('compareBtn') + '</button>' +
        '<span class="tiny muted">' + t('comparePlaceholder') + '</span>' +
        '</div>' +
        '<div id="compareResult"></div>'
    });

    html += card({
      span: 7,
      title: t('friendsTitle'),
      hint: t('friendsSub'),
      aside: '<span class="badge badge--accent">' + m.friends.length + '</span>',
      body: m.friends.length ? '<div class="friends">' + m.friends.map(function (f) {
        return '<div class="friend">' +
          '<span class="friend__ava">' + avatarHtml(f.avatar, f.persona) + '</span>' +
          '<div style="min-width:0"><div class="friend__name">' + esc(f.persona) + '</div>' +
          '<div class="friend__sub">' + t('sharedGames', { n: f.shared.length }) + (f.shared.length ? ' · ' + esc(f.shared.slice(0, 2).join(', ')) : '') + '</div></div>' +
          '<div class="friend__score"><b>' + f.compat + '%</b><small>' + t('compat') + '</small></div>' +
          '</div>';
      }).join('') + '</div>' : '<div class="empty"><span class="empty__icon">♧</span>' + t('friendsEmpty') + '</div>'
    });

    html += card({
      span: 5,
      title: t('radarTitle'),
      hint: t('radarSub'),
      body: radarSvg(m, best)
    });

    $('#viewSocial').innerHTML = '<div class="bento">' + html + '</div>';
  }

  function radarSvg(m, friend) {
    var axes = radarAxes(m);
    var axes2 = friend ? friendAxes(m, friend) : null;
    var size = 210, c = size / 2, r = c - 30, n = axes.length;

    function point(i, value, radius) {
      var ang = (Math.PI * 2 * i) / n - Math.PI / 2;
      var rr = (radius * clamp(value, 0, 100)) / 100;
      return [c + Math.cos(ang) * rr, c + Math.sin(ang) * rr];
    }
    function poly(vals) {
      return vals.map(function (v, i) { return point(i, v, r).map(function (x) { return round(x, 1); }).join(','); }).join(' ');
    }
    function rings() {
      return [25, 50, 75, 100].map(function (p) {
        return '<polygon class="radar-grid" points="' + axes.map(function (_, i) { return point(i, p, r).map(function (x) { return round(x, 1); }).join(','); }).join(' ') + '"/>';
      }).join('');
    }
    function labels() {
      return axes.map(function (a, i) {
        var p = point(i, 114, r);
        var anchor = p[0] < c - 6 ? 'end' : p[0] > c + 6 ? 'start' : 'middle';
        return '<text class="radar-label" x="' + round(p[0], 1) + '" y="' + round(p[1] + 3, 1) + '" text-anchor="' + anchor + '">' + esc(t(a.label)) + '</text>';
      }).join('');
    }
    return '<div class="radar-wrap">' +
      '<svg class="radar" viewBox="0 0 ' + size + ' ' + size + '">' + rings() +
      axes.map(function (_, i) {
        var p = point(i, 100, r);
        return '<line class="radar-axis" x1="' + c + '" y1="' + c + '" x2="' + round(p[0], 1) + '" y2="' + round(p[1], 1) + '"/>';
      }).join('') +
      (axes2 ? '<polygon class="radar-poly radar-poly--b" points="' + poly(axes2) + '"/>' : '') +
      '<polygon class="radar-poly" points="' + poly(axes.map(function (a) { return a.v; })) + '"/>' +
      labels() + '</svg>' +
      '<div style="flex:1;min-width:150px">' +
      '<div class="row" style="margin-bottom:8px"><span class="badge badge--accent">' + esc(m.profile.persona) + '</span>' +
      (friend ? '<span class="badge">' + esc(friend.persona) + '</span>' : '') + '</div>' +
      axes.map(function (a) {
        return '<div class="metric"><span>' + esc(t(a.label)) + '</span><b>' + Math.round(a.v) + '</b></div>';
      }).join('') +
      (friend ? '<div class="note" style="margin-top:10px">' + t('compat') + ': <b>' + friend.compat + '%</b></div>' : '') +
      '</div></div>';
  }

  function friendAxes(m, f) {
    var k = (f.compat || 60) / 100;
    var axes = radarAxes(m);
    return axes.map(function (a, i) {
      var wobble = (hash31((f.steamid || '') + i) % 22) - 11;
      var base = i === 0 ? clamp(Math.sqrt((f.hours || 500) / 4000) * 100, 10, 100) : a.v * (0.62 + k * 0.5);
      return clamp(base + wobble, 6, 100);
    });
  }

  /* ------------------------------------------------------------------ *
   * 13. hall of fame
   * ------------------------------------------------------------------ */

  function renderHall() {
    var records = [
      { k: t('oHours'), v: num(7128) + ' ' + t('hoursShort'), who: 'Nightbird' },
      { k: t('oInventory'), v: money(1677), who: 'OneTap' },
      { k: t('oGames'), v: num(30), who: 'Archivist' },
      { k: t('legacyRareTitle'), v: '0.3%', who: 'Keeper' },
      { k: t('rankTitle'), v: '74 / 100', who: 'Mira' },
      { k: t('oValue'), v: money(4200), who: 'curator_ilya' }
    ];
    $('#hallOfFame').innerHTML =
      '<div class="hall__head">' +
      '<h3 class="hall__title">' + t('hallTitle') + '</h3>' +
      '<span class="hall__sub">' + t('hallSub') + '</span>' +
      '<span class="badge hall__tag">' + t('hallAnon') + '</span>' +
      '</div>' +
      '<div class="hall__grid">' + records.map(function (r) {
        return '<div class="record"><span class="record__k">' + r.k + '</span>' +
          '<span class="record__v">' + r.v + '</span>' +
          '<span class="record__who">' + r.who + '</span></div>';
      }).join('') + '</div>';
  }

  /* ------------------------------------------------------------------ *
   * 14. compare result
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

    host.innerHTML =
      '<div class="duel">' +
      '<div class="duel__head">' +
      '<div class="duel__side"><span class="duel__ava">' + (a.profile.avatar ? '<img src="' + esc(a.profile.avatar) + '" style="width:100%;height:100%;object-fit:cover" alt="">' : esc((a.profile.persona || '?').slice(0, 1))) + '</span>' +
      '<div style="min-width:0"><div class="duel__name">' + esc(a.profile.persona) + '</div><div class="duel__meta">' + t('tier' + a.rank.tier.key) + ' · ' + a.rank.score + '</div></div></div>' +
      '<span class="duel__vs">VS</span>' +
      '<div class="duel__side duel__side--r"><div style="min-width:0"><div class="duel__name">' + esc(b.profile.persona) + '</div><div class="duel__meta">' + t('tier' + b.rank.tier.key) + ' · ' + b.rank.score + '</div></div>' +
      '<span class="duel__ava">' + (b.profile.avatar ? '<img src="' + esc(b.profile.avatar) + '" style="width:100%;height:100%;object-fit:cover" alt="">' : esc((b.profile.persona || '?').slice(0, 1))) + '</span></div>' +
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
   * 15. toasts, modal, clipboard
   * ------------------------------------------------------------------ */

  function toast(message, type) {
    var host = $('#toasts');
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
   * 16. Digital Passport
   * ------------------------------------------------------------------ */

  function passportCard(m) {
    var p = m.profile;
    var initials = esc((p.persona || '?').slice(0, 1).toUpperCase());
    var ava = p.avatar
      ? '<img src="' + esc(p.avatar) + '" alt="" onerror="this.style.display=\'none\'">'
      : '<span>' + initials + '</span>';
    var issued = dateStr(Date.now());

    return '<div class="passport" id="passportCard">' +
      '<div class="passport__top"><span class="passport__brand">STEAM KOSHEL</span>' +
      '<span class="passport__tier">TIER ' + m.rank.tier.key + ' · ' + esc(t(m.rank.tier.label)).toUpperCase() + '</span></div>' +
      '<div class="passport__id"><div class="passport__ava">' + ava + '</div>' +
      '<div><div class="passport__name">' + esc(p.persona) + '</div>' +
      '<div class="passport__handle">STEAM ID ' + esc(p.steamid) + '</div></div></div>' +
      '<div class="passport__grid">' +
      '<div class="passport__cell"><div class="passport__k">' + t('oHours') + '</div><div class="passport__value">' + num(m.totals.hours) + ' ' + t('hoursShort') + '</div></div>' +
      '<div class="passport__cell"><div class="passport__k">' + t('oGames') + '</div><div class="passport__value">' + num(m.totals.games) + '</div></div>' +
      '<div class="passport__cell"><div class="passport__k">' + t('oPortfolio') + '</div><div class="passport__value">' + money(m.money.portfolio) + '</div></div>' +
      '<div class="passport__cell"><div class="passport__k">' + t('rankTitle') + '</div><div class="passport__value">' + m.rank.score + ' / 100</div></div>' +
      '<div class="passport__cell"><div class="passport__k">' + t('achievementsWord') + '</div><div class="passport__value">' + num(m.achievements.unlocked) + '</div></div>' +
      '<div class="passport__cell"><div class="passport__k">' + t('passportClass') + '</div><div class="passport__value">' + esc(t(m.rank.tier.label)) + '</div></div>' +
      '</div>' +
      '<div class="passport__genres">' + m.genres.slice(0, 4).map(function (g) {
        return '<span class="passport__genre">' + esc(genreName(g.name)) + ' ' + Math.round(g.share * 100) + '%</span>';
      }).join('') + '</div>' +
      '<div class="passport__dna"><div><div class="passport__dna-label">' + t('passportDna') + '</div>' +
      '<div class="passport__dna-code">' + serialFor(m) + '</div></div>' +
      '<div style="text-align:right"><div class="passport__dna-label">' + t('passportIssued') + '</div>' +
      '<div class="passport__dna-code" style="font-size:9px">' + esc(issued) + '</div></div></div>' +
      '<div class="passport__note">' + t('passportScan') + ' · ' + t('passportFree') + '</div>' +
      '</div>';
  }

  function bbCode(m) {
    var url = shareUrl(m);
    var lines = [];
    lines.push('[b]STEAM KOSHEL[/b] — Digital Passport');
    lines.push('[b]' + (m.profile.persona || 'Steam') + '[/b] · Tier ' + m.rank.tier.key + ' · ' + t(m.rank.tier.label) + ' (' + m.rank.score + '/100)');
    lines.push('');
    lines.push('[b]' + t('oHours') + ':[/b] ' + num(m.totals.hours) + ' ' + t('hoursShort'));
    lines.push('[b]' + t('oGames') + ':[/b] ' + num(m.totals.games));
    lines.push('[b]' + t('oPortfolio') + ':[/b] ' + money(m.money.portfolio));
    lines.push('[b]' + t('achievementsWord') + ':[/b] ' + num(m.achievements.unlocked) + ' / ' + num(m.achievements.total));
    lines.push('[b]' + t('topWorld', { n: m.rank.topWorld }) + '[/b]');
    lines.push('');
    lines.push('[i]' + m.genres.slice(0, 3).map(function (g) { return genreName(g.name); }).join(' · ') + '[/i]');
    lines.push('[url=' + url + ']' + serialFor(m) + '[/url]');
    return lines.join('\n');
  }

  function shareUrl(m) {
    var base = location.href.split('?')[0].split('#')[0];
    var id = m.source === 'demo' ? (m.preset || 'demo') : m.profile.steamid;
    return base + '?profile=' + encodeURIComponent(id);
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
      '<button class="btn btn--ghost btn--block" type="button" data-action="copy-link">' + t('copyLink') + '</button>' +
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
      }).then(save).catch(function () { save(drawFallbackPassport(m)); });
    } else {
      save(drawFallbackPassport(m));
    }
  }

  function drawFallbackPassport(m) {
    var W = 760, H = 1040;
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
    ctx.font = '700 12px Inter, sans-serif';
    ctx.fillText('TIER ' + m.rank.tier.key + ' · ' + t(m.rank.tier.label).toUpperCase(), W - 52, 72);
    ctx.textAlign = 'left';

    ctx.fillStyle = accent;
    roundRect(ctx, 52, 106, 96, 96, 26);
    ctx.fill();
    ctx.fillStyle = '#fff';
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

    var cells = [
      [t('oHours'), num(m.totals.hours) + ' ' + t('hoursShort')],
      [t('oGames'), num(m.totals.games)],
      [t('oPortfolio'), money(m.money.portfolio)],
      [t('rankTitle'), m.rank.score + ' / 100'],
      [t('achievementsWord'), num(m.achievements.unlocked)],
      [t('topWorld', { n: m.rank.topWorld }), 'Tier ' + m.rank.tier.key]
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
      ctx.fillText(c[0].toUpperCase().slice(0, 26), x + 14, y + 28);
      ctx.fillStyle = '#fff';
      ctx.font = '700 21px Inter, sans-serif';
      ctx.fillText(c[1], x + 14, y + 62);
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
    ctx.fillText(t('passportDna').toUpperCase(), 52, 610);
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

    return canvas;
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
   * 17. i18n application + full render
   * ------------------------------------------------------------------ */

  function applyStaticI18n() {
    document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : state.lang;
    $$('[data-i18n]').forEach(function (node) {
      var k = node.getAttribute('data-i18n');
      node.textContent = t(k);
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
    var p = $('#paletteInput');
    if (p) p.setAttribute('placeholder', t('palettePh'));
  }

  function renderAll() {
    var m = state.model;
    if (!m) return;
    $('#profileHead').innerHTML = renderProfile(m);
    renderOverview(m);
    renderLibrary(m);
    renderLegacy(m);
    renderSocial(m);
    renderHall();
    if (state.compare) renderCompare(state.compare.a, state.compare.b);
    syncView();
    runCountUps($('#results'));
  }

  function syncView() {
    $$('.view').forEach(function (v) { v.hidden = v.getAttribute('data-view') !== state.view; });
    $$('.tab').forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-view') === state.view); });
  }

  function setView(name) {
    state.view = name;
    syncView();
    if (state.model) runCountUps($('#view' + name.charAt(0).toUpperCase() + name.slice(1)));
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
  }

  function setCurrency(cur) {
    if (['RUB', 'USD', 'CNY'].indexOf(cur) < 0) return;
    state.cur = cur;
    persist();
    applyStaticI18n();
    if (state.model) renderAll();
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
    var img = (m.quality.best && m.quality.best.cover) || (m.games[0] && m.games[0].cover);
    if (img) set('og:image', img);
  }

  /* ------------------------------------------------------------------ *
   * 18. data loading
   * ------------------------------------------------------------------ */

  var API_BASE = (location.protocol === 'http:' || location.protocol === 'https:') ? '/api' : null;
  var demoNotified = false;

  function hydrate(data) {
    var games = (data.games || []).map(function (g) {
      return Array.isArray(g) ? normaliseGame(g) : normaliseLiveGame(g);
    });
    return {
      source: data.source || 'live',
      preset: data.preset || '',
      profile: data.profile || {},
      games: games,
      inventory: data.inventory || [],
      achievements: data.achievements || {},
      yearly: data.yearly || [],
      hourly: data.hourly || null,
      wishlist: data.wishlist || [],
      friends: data.friends || [],
      warnings: data.warnings || []
    };
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
      delisted: !!g.delisted,
      cover: g.cover || ('https://cdn.cloudflare.steamstatic.com/steam/apps/' + g.appid + '/header.jpg'),
      accent: g.accent || accentFor(g.appid)
    };
  }

  function indexFor(query, sample) {
    if (sample != null) return sample % DEMO_RAW.length;
    var q = String(query).toLowerCase();
    if (/esport|sasha|awp|кибер|电竞|pro/.test(q)) return 1;
    if (/collect|archive|коллек|收藏|museum/.test(q)) return 2;
    if (/demo|демо|演示|neon|drifter/.test(q)) return 0;
    return hash31(q) % DEMO_RAW.length;
  }

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
        e2.kind = 'http';
        throw e2;
      }
      return res.json();
    });
  }

  /* loader */

  var loaderPromise;

  function showLoader(steps) {
    var box = $('#loader');
    $('#loaderTitle').textContent = steps[0];
    $('#loaderPct').textContent = '0%';
    $('#loaderFill').style.width = '4%';
    $('#loaderSteps').innerHTML = steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    box.hidden = false;
    try { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { box.scrollIntoView(); }
  }

  function hideLoader() {
    $('#loader').hidden = true;
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
    if (['demo', 'esport', 'collector', 'NeonDrifter', 'AWP_Sasha', 'Archive_Keeper'].indexOf(query) >= 0) {
      opts.forceDemo = true;
    }
    state.lastQuery = query;

    $('#results').hidden = true;
    $('#errorState').hidden = true;
    $('#tabs').hidden = true;

    var steps = [t('loadStep1'), t('loadStep2'), t('loadStep3'), t('loadStep4')];
    var dataPromise;

    if (API_BASE && !opts.forceDemo) {
      dataPromise = fetchLive(query).catch(function (err) {
        if (err && err.kind === 'private') throw err;
        return { __fallback: true };
      });
    } else {
      dataPromise = Promise.resolve({ __demo: true });
    }

    showLoader(steps);
    loaderPromise = runLoader(steps);

    Promise.all([loaderPromise, dataPromise]).then(function (res) {
      var data = res[1];
      if (data.__fallback) {
        toast(t('toastSteamDown'), 'warn');
        data = demoRaw(indexFor(query, opts.sample));
        data.source = 'demo';
      } else if (data.__demo) {
        data = demoRaw(indexFor(query, opts.sample));
        data.source = 'demo';
        if (!demoNotified) {
          demoNotified = true;
          toast(t('toastDemo'), 'warn');
        }
      }
      finishLoad(data, query);
    }).catch(function (err) {
      hideLoader();
      if (err && err.kind === 'private') showError('private');
      else showError('generic');
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
    state.pick = null;
    state.year = null;
    state.query = '';
    state.filter = 'all';
    state.compare = null;

    applyAccent((model.quality.best && model.quality.best.accent) || (model.games[0] && model.games[0].accent));
    renderAll();
    $('#results').hidden = false;
    $('#tabs').hidden = false;
    $('#profileHead').className = 'profile';
    pushHistory(model, query);
    updateUrl();
    updateMeta(model);

    try { $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { $('#results').scrollIntoView(); }

    if (state.aiKey) setTimeout(function () { requestAiPortrait(model); }, 900);
  }

  function showError(kind) {
    hideLoader();
    $('#results').hidden = true;
    var box = $('#errorState');
    box.hidden = false;
    if (kind === 'private') {
      $('#errorTitle').textContent = t('privateTitle');
      $('#errorSub').textContent = t('privateSub');
      $('.steps').hidden = false;
      $$('.steps li p').forEach(function (p, i) { p.textContent = t('privateStep' + (i + 1)); });
    } else {
      $('#errorTitle').textContent = t('toastSteamDown');
      $('#errorSub').textContent = t('curatorError');
      $('.steps').hidden = true;
    }
    try { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { box.scrollIntoView(); }
  }

  function updateUrl() {
    if (!state.model) return;
    var id = state.model.source === 'demo' ? (state.model.preset || 'demo') : state.model.profile.steamid;
    if (!id) return;
    try {
      var url = location.pathname + '?profile=' + encodeURIComponent(id) +
        (state.lang !== 'ru' ? '&lang=' + state.lang : '') +
        (state.cur !== 'RUB' ? '&cur=' + state.cur : '');
      history.replaceState(null, '', url);
    } catch (e) { /* file:// may refuse — harmless */ }
  }

  /* ------------------------------------------------------------------ *
   * 19. history
   * ------------------------------------------------------------------ */

  function pushHistory(m, query) {
    var entry = {
      q: query,
      persona: m.profile.persona || query,
      avatar: m.profile.avatar || '',
      steamid: m.profile.steamid || query,
      preset: m.preset || '',
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
    if (!host) return;
    if (!force && input.value.trim()) return;
    renderHistory();
    host.hidden = false;
  }

  function hideHistory() {
    var host = $('#historyDropdown');
    if (host) host.hidden = true;
  }

  /* ------------------------------------------------------------------ *
   * 20. command palette
   * ------------------------------------------------------------------ */

  var palette = { open: false, cursor: 0, items: [], mode: 'commands' };

  function currentSourceLabel() {
    if (!state.model) return 'Steam Koshel';
    return state.model.source === 'live' ? 'live api' : state.model.source === 'cache' ? 'cache' : 'demo';
  }

  function commands() {
    return [
      { group: 'nav', id: 'search', icon: '⌕', label: t('palSearch'), run: function () { closePalette(); focusSearch(); } },
      { group: 'nav', id: 'overview', icon: '▦', label: t('palOverview'), run: function () { setView('overview'); closePalette(); } },
      { group: 'nav', id: 'library', icon: '▤', label: t('palLibrary'), run: function () { setView('library'); closePalette(); } },
      { group: 'nav', id: 'legacy', icon: '✦', label: t('palLegacy'), run: function () { setView('legacy'); closePalette(); } },
      { group: 'nav', id: 'social', icon: '⚔', label: t('palSocial'), run: function () { setView('social'); closePalette(); } },
      { group: 'profile', id: 'passport', icon: '▣', label: t('palPassport'), run: function () { closePalette(); openPassport(); } },
      { group: 'profile', id: 'copy', icon: '⧉', label: t('palCopy'), run: function () {
        if (!state.model) { toast(t('toastNoProfile'), 'warn'); return; }
        copyText(shareUrl(state.model)); closePalette();
      } },
      { group: 'profile', id: 'demo-random', icon: '◈', label: t('palRandom'), run: function () {
        closePalette();
        analyze('demo', { sample: Math.floor(Math.random() * DEMO_RAW.length), forceDemo: !API_BASE });
      } },
      { group: 'lang', id: 'lang-ru', icon: 'RU', label: t('palLangRu'), active: state.lang === 'ru', run: function () { setLang('ru'); closePalette(); } },
      { group: 'lang', id: 'lang-en', icon: 'EN', label: t('palLangEn'), active: state.lang === 'en', run: function () { setLang('en'); closePalette(); } },
      { group: 'lang', id: 'lang-zh', icon: '中', label: t('palLangZh'), active: state.lang === 'zh', run: function () { setLang('zh'); closePalette(); } },
      { group: 'cur', id: 'cur-rub', icon: '₽', label: t('palCurRub'), active: state.cur === 'RUB', run: function () { setCurrency('RUB'); closePalette(); } },
      { group: 'cur', id: 'cur-usd', icon: '$', label: t('palCurUsd'), active: state.cur === 'USD', run: function () { setCurrency('USD'); closePalette(); } },
      { group: 'cur', id: 'cur-cny', icon: '¥', label: t('palCurCny'), active: state.cur === 'CNY', run: function () { setCurrency('CNY'); closePalette(); } },
      { group: 'view', id: 'ambient', icon: '♪', label: t('palAmbient'), sub: state.ambient ? 'on' : 'off', run: function () { toggleAmbient(); closePalette(); } },
      { group: 'view', id: 'zen', icon: '◉', label: t('palZen'), active: state.zen, run: function () { toggleZen(); closePalette(); } },
      { group: 'view', id: 'accent', icon: '◐', label: t('palTheme'), run: function () {
        var next = ACCENTS[(ACCENTS.indexOf(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()) + 1) % ACCENTS.length] || ACCENTS[1];
        applyAccent(next); toast(t('toastAccent')); closePalette();
      } },
      { group: 'view', id: 'hint', icon: '?', label: t('palHint'), run: function () { closePalette(); openHint(); } },
      { group: 'view', id: 'settings', icon: '⚙', label: t('palSettings'), run: function () { palette.mode = 'settings'; renderPaletteSettings(); } }
    ];
  }

  function openPalette(mode) {
    palette.open = true;
    palette.mode = mode || 'commands';
    palette.cursor = 0;
    $('#palette').hidden = false;
    document.body.classList.add('is-locked');
    $('#paletteInput').value = '';
    $('#paletteSource').textContent = currentSourceLabel();
    renderPaletteList('');
    setTimeout(function () { $('#paletteInput').focus(); }, 30);
  }

  function closePalette() {
    palette.open = false;
    $('#palette').hidden = true;
    document.body.classList.remove('is-locked');
    if (!state.model) document.body.classList.remove('is-locked');
  }

  function renderPaletteList(query) {
    var list = $('#paletteList');
    $('#paletteSource').textContent = currentSourceLabel();
    if (palette.mode === 'settings') { renderPaletteSettings(); return; }
    var all = commands();
    var q = (query || '').toLowerCase();
    palette.items = all.filter(function (c) {
      return !q || c.label.toLowerCase().indexOf(q) >= 0 || c.id.indexOf(q) >= 0;
    });
    palette.cursor = clamp(palette.cursor, 0, Math.max(0, palette.items.length - 1));

    if (!palette.items.length) {
      list.innerHTML = '<div class="palette__group">' + t('paletteTitle') + '</div>' +
        '<div class="empty"><span class="empty__icon">⌕</span>' + t('noData') + '</div>';
      return;
    }

    var html = '';
    var group = '';
    var GROUP_LABEL = { nav: 'groupNav', profile: 'groupProfile', lang: 'groupLang', cur: 'groupCur', view: 'groupView' };
    palette.items.forEach(function (c, i) {
      if (c.group !== group) {
        group = c.group;
        html += '<div class="palette__group">' + t(GROUP_LABEL[group] || 'paletteTitle') + '</div>';
      }
      html += '<button class="palette__item ' + (i === palette.cursor ? 'is-cursor' : '') + '" type="button" data-command="' + i + '">' +
        '<span class="pi-icon">' + c.icon + '</span><span>' + esc(c.label) + '</span>' +
        (c.active ? '<span class="pi-check">✓</span>' : c.sub ? '<span class="pi-sub">' + c.sub + '</span>' : '') +
        '</button>';
    });
    list.innerHTML = html;
  }

  function renderPaletteSettings() {
    var list = $('#paletteList');
    list.innerHTML =
      '<div class="palette__group">' + t('settingsAi') + '</div>' +
      '<div class="palette__form">' +
      '<label>' + t('settingsProvider') + '</label>' +
      '<select id="aiProvider">' +
      ['openai', 'openrouter', 'groq'].map(function (p) {
        return '<option value="' + p + '"' + (state.aiProvider === p ? ' selected' : '') + '>' + p + '</option>';
      }).join('') + '</select>' +
      '<label>' + t('settingsKey') + '</label>' +
      '<input id="aiKeyInput" type="password" spellcheck="false" placeholder="sk-..." value="' + esc(state.aiKey) + '">' +
      '<p class="tiny muted">' + t('settingsKeyHint') + '</p>' +
      '<div class="row" style="margin-top:4px">' +
      '<button class="btn btn--primary btn--sm" type="button" data-action="ai-save">' + t('settingsSave') + '</button>' +
      '<button class="btn btn--ghost btn--sm" type="button" data-action="ai-clear">' + t('settingsClear') + '</button>' +
      '<button class="btn btn--ghost btn--sm" type="button" data-action="palette-back">' + t('paletteTitle') + '</button>' +
      '</div></div>';
  }

  function runCommand(index) {
    var c = palette.items[index];
    if (!c) return;
    try { c.run(); } catch (e) { /* noop */ }
  }

  /* ------------------------------------------------------------------ *
   * 21. ambient generator (Web Audio API)
   * ------------------------------------------------------------------ */

  var MOODS = {
    synthwave: { notes: [110, 164.81, 220, 277.18], filter: 1500, wave: 'sawtooth', shift: [0, 3, 5, 7] },
    ambient: { notes: [98, 146.83, 196, 246.94], filter: 900, wave: 'sine', shift: [0, 4, 7, 11] },
    orchestral: { notes: [130.81, 196, 261.63, 329.63], filter: 1800, wave: 'triangle', shift: [0, 3, 7, 10] },
    lofi: { notes: [116.54, 174.61, 233.08, 293.66], filter: 780, wave: 'sine', shift: [0, 2, 7, 9] }
  };

  var amb = { ctx: null, master: null, oscs: [], filter: null, timer: null, mood: 'ambient' };

  function startAmbient(mood) {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { toast(t('toastAmbient'), 'warn'); return; }
    stopAmbient(true);
    amb.mood = MOODS[mood] ? mood : 'ambient';
    var m = MOODS[amb.mood];
    var ctx = new Ctx();
    amb.ctx = ctx;
    var master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    amb.master = master;

    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = m.filter;
    filter.Q.value = 0.9;
    filter.connect(master);
    amb.filter = filter;

    m.notes.forEach(function (f, i) {
      var osc = ctx.createOscillator();
      osc.type = i === 0 ? m.wave : 'sine';
      osc.frequency.value = f;
      var g = ctx.createGain();
      g.gain.value = i === 0 ? 0.09 : 0.05;
      var pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pan) { pan.pan.value = (i - 1.5) / 3; osc.connect(g).connect(pan).connect(filter); }
      else osc.connect(g).connect(filter);

      var lfo = ctx.createOscillator();
      lfo.frequency.value = 0.04 + i * 0.017;
      var lg = ctx.createGain();
      lg.gain.value = 0.028;
      lfo.connect(lg).connect(g.gain);
      lfo.start();
      osc.start();
      amb.oscs.push({ osc: osc, gain: g, lfo: lfo });
    });

    master.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 2.2);

    amb.timer = setInterval(function () {
      if (!amb.ctx) return;
      var mo = MOODS[amb.mood];
      amb.oscs.forEach(function (o, i) {
        var step = mo.shift[i % mo.shift.length];
        var base = mo.notes[i % mo.notes.length];
        try {
          o.osc.frequency.exponentialRampToValueAtTime((base * Math.pow(2, step / 12)) * (i % 2 ? 2 : 1), amb.ctx.currentTime + 3.4);
        } catch (e) { /* noop */ }
      });
    }, 7000);
  }

  function stopAmbient(silent) {
    if (amb.timer) { clearInterval(amb.timer); amb.timer = null; }
    if (amb.master && amb.ctx) {
      try { amb.master.gain.exponentialRampToValueAtTime(0.0001, amb.ctx.currentTime + 0.5); } catch (e) { /* noop */ }
      var ctx = amb.ctx;
      setTimeout(function () { try { ctx.close(); } catch (e) { /* noop */ } }, 600);
    }
    amb.ctx = null;
    amb.master = null;
    amb.oscs = [];
    if (!silent) { /* state handled by caller */ }
  }

  function toggleAmbient() {
    state.ambient = !state.ambient;
    if (state.ambient) {
      startAmbient(state.model ? state.model.sound.mood : 'ambient');
      toast(t('toastAmbient'));
    } else {
      stopAmbient();
      toast(t('toastAmbientOff'));
    }
    syncAmbientButton();
  }

  function syncAmbientButton() {
    var b = $('[data-action="ambient"]');
    if (!b) return;
    b.textContent = state.ambient ? t('ambientOff') : t('ambientOn');
    if (state.ambient) b.setAttribute('data-on', '1');
    else b.removeAttribute('data-on');
  }

  /* ------------------------------------------------------------------ *
   * 22. optional external AI portrait
   * ------------------------------------------------------------------ */

  var AI = {
    openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
    openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-4o-mini' },
    groq: { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' }
  };

  function aiPrompt(m) {
    var langName = state.lang === 'ru' ? 'Russian' : state.lang === 'zh' ? 'Simplified Chinese' : 'English';
    return 'You are a tasteful games curator. Write 110-150 words in ' + langName + ', warm and specific, no clichés, no emoji, no bullet points. ' +
      'Profile data: persona ' + m.profile.persona + '; ' + Math.round(m.totals.hours) + ' hours across ' + m.totals.games + ' games; ' +
      'top genres ' + m.genres.slice(0, 4).map(function (g) { return g.name + ' ' + Math.round(g.share * 100) + '%'; }).join(', ') + '; ' +
      'average critic score ' + m.quality.avgMc + '; never played ' + m.backlog.games + ' games; ' +
      'rare trophies ' + m.achievements.rarest.map(function (r) { return r.name; }).join(', ') + '; ' +
      'rhythm ' + t(m.rhythmLabel) + '; rig ' + t(m.rig.label) + '; portfolio ' + Math.round(m.money.portfolio) + ' USD. ' +
      'Describe the player behind the numbers, their tempo and what they value, without judgement.';
  }

  function requestAiPortrait(m) {
    var host = $('#curatorText');
    if (!host || !state.aiKey) return;
    var conf = AI[state.aiProvider] || AI.openai;
    host.innerHTML = '<p class="muted">' + esc(t('curatorThinking')) + '</p>';

    fetch(conf.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + state.aiKey
      },
      body: JSON.stringify({
        model: conf.model,
        temperature: 0.8,
        max_tokens: 480,
        messages: [
          { role: 'system', content: 'You write short, human, elegant game taste portraits.' },
          { role: 'user', content: aiPrompt(m) }
        ]
      })
    }).then(function (res) {
      if (!res.ok) throw new Error('http');
      return res.json();
    }).then(function (json) {
      var text = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
      if (!text) throw new Error('empty');
      host.innerHTML = '<p>' + esc(text.trim()) + '</p>';
    }).catch(function () {
      host.innerHTML = '<p>' + esc(localPortrait(m, 0)) + '</p>' +
        '<p class="muted" style="font-size:12.5px">' + esc(localPortrait(m, 1)) + '</p>';
      toast(t('curatorError'), 'warn');
    });
  }

  /* ------------------------------------------------------------------ *
   * 23. small ui actions
   * ------------------------------------------------------------------ */

  function toggleZen() {
    state.zen = !state.zen;
    document.body.classList.toggle('zen', state.zen);
    var btn = $('#zenBtn');
    if (btn) btn.setAttribute('aria-pressed', state.zen ? 'true' : 'false');
    if (state.zen) toast(t('toastZen'));
    if (state.model) runCountUps($('#results'));
  }

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

  /* ------------------------------------------------------------------ *
   * 24. queue + compare
   * ------------------------------------------------------------------ */

  function toggleQueue(appid) {
    var id = Number(appid);
    var i = state.queue.indexOf(id);
    if (i >= 0) {
      state.queue.splice(i, 1);
      toast(t('toastUnqueued'));
    } else {
      if (state.queue.length >= 10) state.queue.shift();
      state.queue.push(id);
      toast(t('toastQueued'));
    }
    persist();
    if (state.model) {
      renderLibrary(state.model);
      runCountUps($('#viewLibrary'));
    }
  }

  function doCompare() {
    if (!state.model) { toast(t('toastNoProfile'), 'warn'); return; }
    var input = $('#cmpB');
    var q = input ? input.value.trim() : '';
    if (!q) { toast(t('comparePlaceholder'), 'warn'); if (input) input.focus(); return; }

    if (!API_BASE || state.model.source === 'demo') {
      var idx = (indexFor(state.model.preset || 'demo') + 1) % DEMO_RAW.length;
      var rival = buildModel(hydrate(demoRaw(idx)));
      state.compare = { a: state.model, b: rival };
      renderCompare(state.model, rival);
      toast(t('compareNeedFriend'), 'warn');
      return;
    }

    var host = $('#compareResult');
    if (host) host.innerHTML = '<div class="note" style="margin-top:14px">' + esc(t('curatorThinking')) + '</div>';
    fetchLive(q).then(function (data) {
      var rival = buildModel(hydrate(data));
      state.compare = { a: state.model, b: rival };
      renderCompare(state.model, rival);
    }).catch(function () {
      toast(t('toastSteamDown'), 'warn');
      var raw = demoRaw(indexFor(q));
      var rival2 = buildModel(hydrate(raw));
      state.compare = { a: state.model, b: rival2 };
      renderCompare(state.model, rival2);
    });
  }

  /* ------------------------------------------------------------------ *
   * 25. action dispatcher
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
      case 'copy-link':
        if (!state.model) { toast(t('toastNoProfile'), 'warn'); break; }
        copyText(shareUrl(state.model), t('toastCopied'));
        break;
      case 'reanalyze':
        analyze(state.lastQuery || (state.model && state.model.profile.persona) || 'demo',
          { forceDemo: !API_BASE });
        break;
      case 'curator-refresh':
        state.portraitIndex = (state.portraitIndex + 1) % 3;
        if (state.model) {
          renderOverview(state.model);
          runCountUps($('#viewOverview'));
          if (state.aiKey) requestAiPortrait(state.model);
        }
        break;
      case 'open-settings':
        openPalette('settings');
        break;
      case 'ambient':
        toggleAmbient();
        break;
      case 'pick-again':
        state.pickIndex++;
        if (state.model) {
          renderLibrary(state.model);
          runCountUps($('#viewLibrary'));
        }
        break;
      case 'queue-add':
        toggleQueue(node.getAttribute('data-appid'));
        break;
      case 'queue-remove':
        toggleQueue(node.getAttribute('data-appid'));
        break;
      case 'queue-clear':
        state.queue = [];
        persist();
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
      case 'ai-save':
        var keyInput = $('#aiKeyInput');
        var provInput = $('#aiProvider');
        state.aiKey = keyInput ? keyInput.value.trim() : '';
        state.aiProvider = provInput ? provInput.value : 'openai';
        store('sk_ai_key', state.aiKey);
        store('sk_ai_provider', state.aiProvider);
        closePalette();
        toast(t('settingsSaved'));
        if (state.model) {
          renderOverview(state.model);
          runCountUps($('#viewOverview'));
          if (state.aiKey) requestAiPortrait(state.model);
        }
        break;
      case 'ai-clear':
        state.aiKey = '';
        store('sk_ai_key', '');
        closePalette();
        toast(t('settingsCleared'));
        break;
      case 'palette-back':
        palette.mode = 'commands';
        palette.cursor = 0;
        $('#paletteInput').value = '';
        renderPaletteList('');
        $('#paletteInput').focus();
        break;
      case 'history-open':
        showHistory(true);
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------------ *
   * 26. events
   * ------------------------------------------------------------------ */

  function bindEvents() {
    /* language + currency */
    $('#langSwitch').addEventListener('click', function (e) {
      var b = e.target.closest('[data-lang]');
      if (b) setLang(b.getAttribute('data-lang'));
    });
    $('#currencySwitch').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cur]');
      if (b) setCurrency(b.getAttribute('data-cur'));
    });

    /* palette + zen */
    $('#paletteBtn').addEventListener('click', function () { openPalette('commands'); });
    $('#footerPalette').addEventListener('click', function () { openPalette('commands'); });
    $('#zenBtn').addEventListener('click', toggleZen);

    /* brand */
    $('#brandHome').addEventListener('click', function (e) {
      e.preventDefault();
      state.model = null;
      state.compare = null;
      $('#results').hidden = true;
      $('#tabs').hidden = true;
      $('#errorState').hidden = true;
      $('#hero').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      focusSearch();
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
      analyze($('#searchInput').value, { forceDemo: !API_BASE });
    });
    $('#searchInput').addEventListener('focus', function () {
      if (!$('#searchInput').value.trim()) showHistory(true);
    });
    $('#searchInput').addEventListener('input', function () {
      if ($('#searchInput').value.trim()) hideHistory();
      else showHistory(true);
    });

    /* samples */
    $('#samples').addEventListener('click', function (e) {
      var b = e.target.closest('[data-sample]');
      if (!b) return;
      var idx = Number(b.getAttribute('data-sample'));
      $('#searchInput').value = ['demo', 'esport', 'collector'][idx] || 'demo';
      analyze('demo', { sample: idx, forceDemo: !API_BASE });
    });

    /* error block */
    $('#errorRetry').addEventListener('click', function () {
      analyze(state.lastQuery || 'demo', { forceDemo: !API_BASE });
    });
    $('#errorDemo').addEventListener('click', function () {
      analyze('demo', { sample: 0, forceDemo: true });
    });
    $('#footerDemo').addEventListener('click', function () {
      analyze('demo', { sample: 0, forceDemo: !API_BASE });
    });

    /* primary delegated click */
    document.addEventListener('click', function (e) {
      if (e.target.hasAttribute && e.target.hasAttribute('data-palette-close')) {
        closePalette();
        return;
      }
      if (e.target.closest('[data-modal]') === e.target && e.target.hasAttribute('data-modal')) {
        closeModal();
        return;
      }

      var cmd = e.target.closest('[data-command]');
      if (cmd) { runCommand(Number(cmd.getAttribute('data-command'))); return; }

      var histItem = e.target.closest('[data-history]');
      if (histItem) {
        var h = state.history[Number(histItem.getAttribute('data-history'))];
        if (h) {
          hideHistory();
          $('#searchInput').value = h.q;
          analyze(h.q, { forceDemo: !API_BASE });
        }
        return;
      }

      var act = e.target.closest('[data-action]');
      if (act) { handleAction(act.getAttribute('data-action'), act, e); return; }

      var tab = e.target.closest('.tab');
      if (tab) { setView(tab.getAttribute('data-view')); return; }

      var chip = e.target.closest('[data-filter]');
      if (chip) {
        state.filter = chip.getAttribute('data-filter');
        if (state.model) { renderLibrary(state.model); runCountUps($('#viewLibrary')); }
        return;
      }

      var yearBtn = e.target.closest('[data-year]');
      if (yearBtn) {
        state.year = Number(yearBtn.getAttribute('data-year'));
        if (state.model) { renderLegacy(state.model); runCountUps($('#viewLegacy')); }
        return;
      }

      var altBtn = e.target.closest('[data-alt]');
      if (altBtn) {
        state.altMode = altBtn.getAttribute('data-alt');
        if (state.model) { renderOverview(state.model); runCountUps($('#viewOverview')); }
        return;
      }

      /* click outside helper popovers */
      if (!e.target.closest('.search')) hideHistory();
      if (!e.target.closest('.hint')) closeHint();
    });

    /* inputs */
    document.addEventListener('input', function (e) {
      var id = e.target.id;
      if (id === 'saleSlider') {
        var m = state.model;
        if (!m) return;
        var v = Number(e.target.value);
        var price = m.money.full * (1 - v / 100);
        var save = m.money.full * (v / 100);
        var pct = $('#salePct'); if (pct) pct.textContent = v + '%';
        var pr = $('#salePrice'); if (pr) pr.textContent = money(price);
        var sv = $('#saleSave'); if (sv) sv.textContent = money(save);
        return;
      }
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
      if (id === 'paletteInput') {
        palette.cursor = 0;
        renderPaletteList(e.target.value);
        return;
      }
    });

    /* keyboard */
    document.addEventListener('keydown', function (e) {
      var isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      var mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        palette.open ? closePalette() : openPalette('commands');
        return;
      }

      if (e.key === 'Escape') {
        if (palette.open) { closePalette(); return; }
        if ($('#modalRoot').innerHTML.trim()) { closeModal(); return; }
        closeHint();
        hideHistory();
        return;
      }

      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

      if (palette.open) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          palette.cursor = Math.min(palette.items.length - 1, palette.cursor + 1);
          renderPaletteList($('#paletteInput').value);
          scrollPaletteCursor();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          palette.cursor = Math.max(0, palette.cursor - 1);
          renderPaletteList($('#paletteInput').value);
          scrollPaletteCursor();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (palette.mode === 'commands') runCommand(palette.cursor);
          return;
        }
      }

      if (e.key === '/' && !typing && !palette.open) {
        e.preventDefault();
        focusSearch();
        return;
      }

      if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'cmpB') {
        e.preventDefault();
        doCompare();
      }
    });

    /* topbar shadow */
    window.addEventListener('scroll', function () {
      var bar = $('#topbar');
      if (bar) bar.classList.toggle('is-stuck', window.scrollY > 12);
    }, { passive: true });

    /* palette click items are handled above; but keep focus after render */
  }

  function scrollPaletteCursor() {
    var node = $('.palette__item.is-cursor');
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
  }

  /* ------------------------------------------------------------------ *
   * 27. bootstrap
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

    var hintBtn = $('#hintBtn');
    if (hintBtn) hintBtn.setAttribute('aria-expanded', 'false');

    if (profileParam) {
      $('#searchInput').value = profileParam;
      analyze(profileParam, { forceDemo: !API_BASE, quiet: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
