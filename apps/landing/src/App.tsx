import React, { useState } from 'react';

interface PresetInfo {
  id: string;
  name: string;
  desc: string;
  specs: {
    area: string;
    walls: string;
    rooms: string;
    features: string[];
  };
  price: string;
  features: string[];
}

const PRESETS: PresetInfo[] = [
  {
    id: 'scandi',
    name: 'Скандинавский минимализм',
    desc: 'Светлая, наполненная естественным светом планировка. Тёплые оттенки дуба, обилие зелени и функциональная мебель создают атмосферу абсолютного комфорта.',
    specs: {
      area: '78.4 м²',
      walls: 'Несущий периметр, свободные перегородки',
      rooms: '2 комнаты (кухня-гостиная + спальня)',
      features: ['Ванная с окном', 'Панорамные окна', 'Уютная обеденная зона']
    },
    price: '18 200 000 ₽',
    features: ['Ванна', 'Двуспальная кровать', 'Угловой диван']
  },
  {
    id: 'loft',
    name: 'Индустриальный лофт',
    desc: 'Брутальный стиль для современных людей. Открытое студийное пространство без лишних перегородок, текстуры красного кирпича и темного металла, выделенная рабочая зона.',
    specs: {
      area: '78.4 м²',
      walls: 'Свободная планировка, открытые зоны',
      rooms: 'Единая студия (Open Space)',
      features: ['Рабочая зона (офис)', 'Душевая кабина', 'Островная кухня']
    },
    price: '18 500 000 ₽',
    features: ['Стильный 3-местный диван', 'Рабочий стол', 'Душ']
  },
  {
    id: 'family',
    name: 'Семейная эргономика',
    desc: 'Максимально продуманное пространство для семьи с ребенком. Грамотное зонирование отделяет взрослую спальню от детской игровой и учебной комнаты.',
    specs: {
      area: '78.4 м²',
      walls: 'Дополнительные перегородки звукоизоляции',
      rooms: '3 комнаты (спальня + детская + гостиная)',
      features: ['Выделенная детская', 'Большие системы хранения', 'Кухня-гостиная']
    },
    price: '18 900 000 ₽',
    features: ['Детская кровать', 'Двуспальная кровать', 'Шкафы-купе']
  }
];

const MOCK_API_UPLOADS = 'http://localhost:3000/api/uploads';

function App() {
  const [selectedPresetId, setSelectedPresetId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('s') || params.get('sceneId');
    // If the token matches a preset, load it, otherwise default to scandi (or treat as custom)
    if (token && ['scandi', 'loft', 'family'].includes(token)) {
      return token;
    }
    return token ? 'custom' : 'scandi';
  });

  const [customToken, setCustomToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('s') || params.get('sceneId');
    if (token && !['scandi', 'loft', 'family'].includes(token)) {
      return token;
    }
    return '';
  });

  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadSubmitted, setLeadSubmitted] = useState(false);

  const handlePresetSelect = (id: string) => {
    setSelectedPresetId(id);
    setCustomToken('');
    // Update URL query string
    const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?s=${id}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
  };

  const getWidgetSrc = () => {
    const token = customToken || selectedPresetId;
    return `http://localhost:5173/client.html?s=${token}`;
  };

  const activePreset = PRESETS.find(p => p.id === selectedPresetId) || PRESETS[0];

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName || !leadPhone) return;

    try {
      const res = await fetch('http://localhost:3000/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: leadName,
          phone: leadPhone,
          comment: `Заявка с лендинга ЖК Anniversary. Выбран пресет: ${selectedPresetId}`,
          sceneId: 'preset-landing',
          shareToken: customToken || selectedPresetId
        })
      });

      if (res.ok) {
        setLeadSubmitted(true);
      } else {
        alert('Ошибка при отправке заявки.');
      }
    } catch (err) {
      console.error(err);
      alert('Ошибка соединения с сервером.');
    }
  };

  return (
    <div className="min-h-screen bg-[#060a13] text-white flex flex-col font-sans selection:bg-amber-500 selection:text-black">
      {/* Header / Navbar */}
      <header className="fixed w-full top-0 z-50 bg-[#060a13]/85 backdrop-blur-xl border-b border-white/5 shadow-2xl">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-2xl md:text-3xl font-light tracking-[0.3em] text-amber-500 uppercase font-serif">Anniversary</span>
            <div className="hidden sm:block w-px h-5 bg-white/10" />
            <span className="hidden sm:inline text-[9px] text-gray-400 font-light tracking-[0.2em] uppercase mt-1">РЕМИНГТОН ДЕВЕЛОПМЕНТ</span>
          </div>
          <nav className="hidden lg:flex gap-8 text-xs uppercase tracking-[0.2em] font-medium text-gray-300">
            <a href="#about" className="hover:text-amber-500 transition-colors">О проекте</a>
            <a href="#amenities" className="hover:text-amber-500 transition-colors">Преимущества</a>
            <a href="#planner" className="hover:text-amber-500 transition-colors">3D Конфигуратор</a>
            <a href="#gallery" className="hover:text-amber-500 transition-colors">Галерея ИИ</a>
            <a href="#contact" className="hover:text-amber-500 transition-colors">Контакты</a>
          </nav>
          <a
            href="#contact"
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider transition-all hover:scale-105 active:scale-95 shadow-lg shadow-amber-500/10"
          >
            Купить квартиру
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#060a13]/20 via-[#060a13]/80 to-[#060a13] z-10" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

        {/* Hero Background Image */}
        <img
          src={`${MOCK_API_UPLOADS}/anniversary_hero.png`}
          alt="Anniversary Luxury Residence"
          className="absolute inset-0 w-full h-full object-cover opacity-50 scale-105 animate-pulse duration-10000"
          onError={(e) => {
            // Fallback to beautiful default photo if server isn't serving it yet
            e.currentTarget.src = "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=2075&auto=format&fit=crop";
          }}
        />

        <div className="relative z-20 text-center px-4 max-w-4xl mx-auto mt-20">
          <span className="text-[10px] font-bold text-amber-500 tracking-[0.3em] uppercase block mb-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
            АРХИТЕКТУРНЫЙ ШЕДЕВР В ИСТОРИЧЕСКОМ ЦЕНТРЕ
          </span>
          <h1 className="text-5xl md:text-8xl font-light mb-8 leading-tight font-serif animate-in fade-in slide-in-from-bottom-3 duration-1000">
            Искусство жить <br />
            <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-yellow-100">
              на высоте
            </span>
          </h1>
          <p className="text-sm md:text-base text-gray-300 font-light mb-12 max-w-2xl mx-auto leading-relaxed tracking-wide animate-in fade-in slide-in-from-bottom-4 duration-1200">
            ЖК Anniversary — это премиальные панорамные пентхаусы и резиденции. 
            Авторское лобби из натурального мрамора, собственный велнес-клуб, приватный двор-парк и передовые ИИ-системы конфигурации жилья.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href="#planner"
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-bold rounded-2xl uppercase tracking-widest text-xs transition-all hover:scale-105 active:scale-95 shadow-xl shadow-amber-500/15"
            >
              Конфигурировать в 3D
            </a>
            <a
              href="#about"
              className="w-full sm:w-auto px-8 py-4 border border-white/20 text-white hover:bg-white/5 rounded-2xl uppercase tracking-widest text-xs transition-all active:scale-95"
            >
              Узнать о ЖК
            </a>
          </div>
        </div>
      </section>

      {/* About / Philosophy Section */}
      <section id="about" className="py-24 relative overflow-hidden border-t border-white/5">
        <div className="container mx-auto px-6">
          <div className="flex flex-col lg:flex-row gap-16 items-center">
            
            {/* Left Column: Image */}
            <div className="w-full lg:w-1/2 relative group">
              <div className="absolute -inset-1.5 bg-gradient-to-r from-amber-500 to-indigo-500 rounded-[2rem] blur opacity-15 group-hover:opacity-25 transition duration-1000" />
              <div className="relative rounded-[2rem] overflow-hidden bg-slate-900 border border-white/10 shadow-2xl">
                <img
                  src={`${MOCK_API_UPLOADS}/anniversary_lobby.png`}
                  alt="Anniversary Luxury Lobby"
                  className="w-full h-[400px] object-cover transition-transform duration-700 group-hover:scale-105"
                  onError={(e) => {
                    e.currentTarget.src = "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=2053&auto=format&fit=crop";
                  }}
                />
              </div>
            </div>

            {/* Right Column: Text */}
            <div className="w-full lg:w-1/2 flex flex-col gap-6">
              <span className="text-[10px] font-bold text-amber-500 tracking-[0.2em] uppercase">ПРИВАТНОСТЬ И СТАТУС</span>
              <h2 className="text-4xl md:text-5xl font-light font-serif">
                Пространство, созданное <br />
                <span className="italic font-normal text-amber-400">для великих свершений</span>
              </h2>
              <p className="text-gray-400 font-light leading-relaxed text-sm">
                Каждая деталь в Anniversary олицетворяет философию элитного девелопмента. Лобби с каминным залом, консьерж-сервис уровня 5-звездочных отелей, закрытый фитнес-центр со спа-зоной и беспрецедентная безопасность.
              </p>
              <p className="text-gray-400 font-light leading-relaxed text-sm">
                Главная особенность — полная свобода планировочных решений. Стены внутри ваших апартаментов делятся на капитальные несущие конструкции и легкие перегородки. С помощью нашего 3D-конструктора вы можете настроить пространство под себя и увидеть результат до начала ремонта.
              </p>

              <div className="grid grid-cols-3 gap-6 border-t border-white/10 pt-8 mt-4 text-center sm:text-left">
                <div>
                  <div className="text-3xl font-light text-amber-500 font-serif">3.0 м</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Высота потолков</div>
                </div>
                <div>
                  <div className="text-3xl font-light text-amber-500 font-serif">24/7</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Консьерж-сервис</div>
                </div>
                <div>
                  <div className="text-3xl font-light text-amber-500 font-serif">120 м²</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Зона Спа и Фитнеса</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Interactive Layout Builder Section */}
      <section id="planner" className="py-24 bg-[#080d19] relative border-t border-b border-white/5">
        <div className="container mx-auto px-6">
          
          {/* Section Header */}
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-[10px] font-bold text-amber-500 tracking-[0.2em] uppercase block mb-3">
              ИНТЕРАКТИВНЫЙ 3D КОНФИГУРАТОР
            </span>
            <h2 className="text-4xl md:text-5xl font-light font-serif mb-6">
              Спроектируйте <span className="italic font-normal text-amber-400">свою будущую</span> квартиру
            </h2>
            <p className="text-gray-400 font-light text-sm">
              Выберите один из заготовленных нашими дизайнерами пресетов, измените планировку по своему вкусу (перемещайте и сносите ненесущие перегородки, меняйте расстановку мебели) и сделайте реалистичный фоторендер с помощью ИИ.
            </p>
          </div>

          <div className="flex flex-col xl:flex-row gap-8 items-stretch justify-center max-w-[1400px] mx-auto">
            
            {/* Presets Sidebar (Left) */}
            <div className="w-full xl:w-[380px] flex flex-col gap-6 bg-[#0c1222] border border-white/5 rounded-[2rem] p-6 justify-between">
              
              {/* Presets Selector List */}
              <div className="flex flex-col gap-4">
                <h3 className="text-lg font-serif font-semibold border-b border-white/10 pb-3">
                  {customToken ? '🔗 Пользовательская планировка' : 'Выберите базовый пресет'}
                </h3>
                
                {customToken && (
                  <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-2xl text-xs text-amber-200 leading-normal">
                    📌 Вы открыли планировку, созданную пользователем. Вы можете редактировать её или переключиться на стандартные варианты дизайнеров ниже.
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handlePresetSelect(preset.id)}
                      className={`p-4 rounded-2xl border text-left transition-all duration-300 ${
                        selectedPresetId === preset.id && !customToken
                          ? 'bg-amber-500/10 border-amber-500 text-white'
                          : 'border-white/5 hover:border-white/10 bg-[#060a13]/60 text-gray-400'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-bold text-white">{preset.name}</span>
                        {selectedPresetId === preset.id && !customToken && (
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                        )}
                      </div>
                      <p className="text-[10px] font-light leading-relaxed mb-3 text-gray-500">
                        {preset.desc}
                      </p>
                      
                      {/* Chips */}
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-[8px] bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded uppercase">
                          {preset.specs.area}
                        </span>
                        <span className="text-[8px] bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded uppercase">
                          {preset.specs.rooms}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Preset Metadata card */}
              <div className="border-t border-white/10 pt-6 mt-6">
                <span className="text-[10px] uppercase font-bold text-amber-500 tracking-wider">Характеристики планировки</span>
                
                <div className="mt-3 space-y-2 text-xs font-light text-gray-400">
                  <div className="flex justify-between">
                    <span>Стены:</span>
                    <span className="font-semibold text-white text-right max-w-[200px] truncate">{activePreset.specs.walls}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Наполнение:</span>
                    <span className="font-semibold text-white">{activePreset.features.slice(0,2).join(', ')}...</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-3 border-t border-white/5">
                    <span>Цена объекта:</span>
                    <span className="text-base font-bold text-amber-400 font-serif">{activePreset.price}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Widget Viewport (Right) */}
            <div className="flex-1 bg-[#05080e] rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl relative flex flex-col h-[75vh] min-h-[550px] xl:h-auto">
              
              {/* Overlays / Widget Header */}
              <div className="absolute top-4 right-4 z-20 flex gap-2">
                <span className="bg-slate-950/90 text-amber-400 font-bold text-[9px] uppercase tracking-wider px-3 py-1.5 rounded-full border border-amber-500/20 backdrop-blur-md shadow-lg">
                  🤖 Поддержка ИИ рендеринга
                </span>
                <span className="bg-slate-950/90 text-white font-bold text-[9px] uppercase tracking-wider px-3 py-1.5 rounded-full border border-white/5 backdrop-blur-md shadow-lg">
                  3D Walk Mode
                </span>
              </div>

              {/* Loader Spinner before widget fully mounts */}
              <div className="absolute inset-0 bg-[#05080e] flex items-center justify-center z-0">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[10px] text-gray-500 tracking-widest uppercase">Инициализация 3D сцены...</span>
                </div>
              </div>

              {/* The Iframe itself */}
              <iframe
                key={customToken || selectedPresetId} // Forces reload when preset changes
                src={getWidgetSrc()}
                className="w-full h-full border-none relative z-10 bg-transparent"
                title="Interactive Layout Widget"
              />

            </div>

          </div>

        </div>
      </section>

      {/* Gallery & AI showcase */}
      <section id="gallery" className="py-24 relative">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-[10px] font-bold text-amber-500 tracking-[0.2em] uppercase block mb-3">ДИЗАЙН И ВИЗУАЛИЗАЦИЯ</span>
            <h2 className="text-4xl md:text-5xl font-light font-serif">Фотореалистичные ИИ проекты</h2>
            <p className="text-gray-400 font-light text-sm mt-4">
              Оцените качество интерьеров, сгенерированных нашей нейросетью. Конструктор анализирует 3D геометрию ваших стен и расставленные предметы мебели, превращая их в готовый дизайн-проект за секунды.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Photo 1: Morning */}
            <div className="group rounded-3xl overflow-hidden border border-white/5 bg-[#0c1222] shadow-xl relative">
              <div className="h-72 overflow-hidden relative">
                <img
                  src={`${MOCK_API_UPLOADS}/scandi_morning.png`}
                  alt="Scandi Style Morning AI Render"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute top-4 left-4 bg-slate-950/80 border border-amber-500/20 text-amber-400 font-bold text-[9px] uppercase px-2.5 py-1 rounded-lg backdrop-blur-md">
                  ☀️ Солнечное утро
                </div>
              </div>
              <div className="p-6">
                <h4 className="font-serif text-lg font-bold mb-2">Скандинавский свет</h4>
                <p className="text-xs text-gray-500 font-light leading-relaxed">
                  Рендер в стиле Scandi при утреннем освещении. Нейросеть сгенерировала деревянные рейки, мягкий текстиль и сочные тени от утреннего солнца.
                </p>
              </div>
            </div>

            {/* Photo 2: Evening */}
            <div className="group rounded-3xl overflow-hidden border border-white/5 bg-[#0c1222] shadow-xl relative">
              <div className="h-72 overflow-hidden relative">
                <img
                  src={`${MOCK_API_UPLOADS}/scandi_evening.png`}
                  alt="Scandi Style Evening AI Render"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute top-4 left-4 bg-slate-950/80 border border-indigo-500/20 text-indigo-400 font-bold text-[9px] uppercase px-2.5 py-1 rounded-lg backdrop-blur-md">
                  🌙 Уютный вечер
                </div>
              </div>
              <div className="p-6">
                <h4 className="font-serif text-lg font-bold mb-2">Камерный вечерний уют</h4>
                <p className="text-xs text-gray-500 font-light leading-relaxed">
                  Вечерний вариант того же интерьера. Обратите внимание, как ИИ корректно расставил скрытые подсветки, зажёг свечи и добавил тёплую атмосферу.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Lead Form Section */}
      <section id="contact" className="py-24 bg-gradient-to-b from-[#060a13] to-[#04060c] relative border-t border-white/5">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[150px] pointer-events-none" />

        <div className="container mx-auto px-6 max-w-xl text-center relative z-15">
          <span className="text-[10px] font-bold text-amber-500 tracking-[0.2em] uppercase block mb-3">ОСТАВИТЬ ЗАЯВКУ</span>
          <h2 className="text-4xl md:text-5xl font-light font-serif mb-4">Начать новую историю</h2>
          <p className="text-gray-400 font-light text-sm mb-12">
            Оставьте ваши контакты. Наш менеджер свяжется с вами, ответит на все вопросы по планировкам ЖК Anniversary и поможет забронировать понравившуюся квартиру.
          </p>

          {leadSubmitted ? (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-[2rem] p-8 text-center animate-in zoom-in-95 duration-500">
              <span className="text-3xl block mb-3">🎉</span>
              <h4 className="text-lg font-bold text-white mb-2">Заявка принята!</h4>
              <p className="text-xs text-gray-400 font-light leading-normal">
                Благодарим вас за проявленный интерес. Мы свяжемся с вами в течение 15 минут для подробной консультации и презентации проекта.
              </p>
            </div>
          ) : (
            <form onSubmit={handleLeadSubmit} className="flex flex-col gap-4 text-left">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase font-bold text-gray-500 tracking-wider">Ваше имя</label>
                <input
                  type="text"
                  required
                  placeholder="Константин"
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  className="w-full bg-[#0c1222] border border-white/5 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none rounded-2xl px-5 py-4 text-sm font-medium transition-all shadow-inner placeholder:text-gray-700"
                />
              </div>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase font-bold text-gray-500 tracking-wider">Номер телефона</label>
                <input
                  type="tel"
                  required
                  placeholder="+7 (999) 000-00-00"
                  value={leadPhone}
                  onChange={(e) => setLeadPhone(e.target.value)}
                  className="w-full bg-[#0c1222] border border-white/5 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none rounded-2xl px-5 py-4 text-sm font-medium transition-all shadow-inner placeholder:text-gray-700"
                />
              </div>

              <button
                type="submit"
                className="w-full py-4.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-bold rounded-2xl uppercase tracking-widest text-xs transition-all hover:scale-103 active:scale-97 shadow-xl shadow-amber-500/10 mt-6"
              >
                Заказать обратный звонок
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-[#03050a] border-t border-white/5 mt-auto">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center md:items-start gap-1">
            <span className="text-xl font-light tracking-[0.2em] text-amber-500 uppercase font-serif">Anniversary</span>
            <span className="text-[9px] text-gray-600 uppercase font-light tracking-widest">Remington Development &copy; {new Date().getFullYear()}</span>
          </div>

          <div className="text-[10px] text-gray-600 font-light text-center md:text-right max-w-md leading-relaxed">
            Любые материалы на данном сайте носят исключительно информационный характер и не являются публичной офертой, определяемой положениями Ст. 437 ГК РФ. Планировочные решения и 3D визуализации являются примерными концепциями дизайна.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
