# Руководство по интеграции: Встраиваемый 3D-виджет FlatBuilder с поддержкой Whitelabel

FlatBuilder предоставляет девелоперам, жилым комплексам и агентствам недвижимости готовый встраиваемый 3D-модуль планировок с полной поддержкой **Whitelabel** (индивидуальный брендинг, фирменные цвета, светлая и тёмная темы, скрытие водяных знаков и прямая интеграция с CRM).

---

## 1. Способы интеграции

| Способ | Сложность | Для кого подходит |
|---|---|---|
| **Iframe (HTML)** | ⭐️ Быстро (2 мин) | Tilda, WordPress, Bitrix, Webflow, лендинги |
| **Embed SDK (`embed.js`)** | ⭐️⭐️ Просто (5 мин) | Любой сайт, каталоги с динамической подгрузкой |
| **PostMessage API** | ⭐️⭐️⭐️ Продвинуто | Кастомные SPA (React / Vue / Next.js), интеграция с Метрикой и CRM |

---

## 2. Способ 1: Встраивание через Iframe

Самый быстрый способ встроить 3D-виджет в карточку квартиры или раздел на сайте.

### Базовый пример HTML-кода

```html
<iframe
  src="https://widget.flatbuilder.io/client.html?s=euro2&brand=ЖК+Горизонт&color=%2310b981&theme=dark&phone=%2B74951234567&cta=Забронировать&hideBranding=1"
  width="100%"
  height="720px"
  frameborder="0"
  allow="accelerometer; autoplay; camera; gyroscope"
  style="border-radius: 20px; border: 1px solid rgba(0,0,0,0.1); width: 100%; display: block;"
></iframe>
```

---

## 3. Таблица параметров URL (Whitelabel & Features)

Все параметры передаются в Query-строку адреса `/client.html`:

| Параметр | Тип | По умолчанию | Описание | Пример |
|---|---|---|---|---|
| `s` или `sceneId` | string | `euro2` | Идентификатор планировки или share-токен сцены | `s=euro2`, `s=penthouse` |
| `brand` или `brandName` | string | `ANNIVERSARY` | Название жилого комплекса или застройщика | `brand=ЖК+Онегин` |
| `subtitle` | string | `Remington Dev` | Подзаголовок (девелопер, класс жилья) | `subtitle=ГК+Самолет` |
| `color` | hex | `#f59e0b` | Фирменный акцентный цвет кнопок и плашек | `color=%2310b981` |
| `theme` | `dark` \| `light` | `dark` | Цветовая тема интерфейса | `theme=light` |
| `logo` | URL | — | Ссылка на PNG/SVG логотип бренда | `logo=https://site.ru/logo.png` |
| `phone` | string | — | Телефон отдела продаж (отображается в шапке) | `phone=%2B74950000000` |
| `cta` | string | `Оставить заявку` | Текст на главной кнопке конверсии | `cta=Забронировать` |
| `hideBranding` | `1` \| `0` | `0` | Скрыть плашку «Powered by FlatBuilder 3D» (100% Whitelabel) | `hideBranding=1` |
| `atmosphere` | `1` \| `0` | `1` | Показывать переключатель День / Закат / Ночь | `atmosphere=1` |
| `passport` | `1` \| `0` | `1` | Кнопка скачивания PDF-паспорта квартиры | `passport=1` |
| `materials` | `1` \| `0` | `1` | Кнопка выбора чистовой отделки пола и стен | `materials=1` |
| `apartmentPicker` | `1` \| `0` | `1` | Оверлей с характеристиками и выбором квартир | `apartmentPicker=1` |
| `webhook` | URL | — | URL вебхука вашей CRM для прямой отправки заявок | `webhook=https://crm.dev.ru/hook` |

---

## 4. Способ 2: Встраивание через Embed SDK (`embed.js`)

Скрипт `embed.js` автоматически находит контейнеры с атрибутом `data-flat-widget`, создает адаптивный iframe и настраивает двустороннюю связь.

### 1) Декларативное подключение:

```html
<!-- Контейнер с атрибутами -->
<div data-flat-widget
     data-scene="euro2"
     data-brand="ЖК «Новые Горизонты»"
     data-subtitle="Бизнес-класс"
     data-color="#0284c7"
     data-theme="dark"
     data-phone="+7 (495) 777-55-33"
     data-cta="Забронировать"
     data-hide-branding="true"
     style="width: 100%; height: 720px; border-radius: 24px; overflow: hidden;">
</div>

<!-- Подключение SDK в конце страницы -->
<script src="https://widget.flatbuilder.io/embed.js" async></script>
```

### 2) Программное создание через JavaScript API:

```javascript
// Инициализация виджета в конкретном элементе
const widget = FlatBuilder.init('#my-widget-container', {
  scene: 'family',
  brand: 'ЖК Парковый',
  color: '#10b981',
  theme: 'light',
  phone: '+7 (495) 123-45-67',
  hideBranding: true
});

// Динамическое переключение квартиры при клике по каталогу на вашем сайте:
document.querySelector('#btn-penthouse').addEventListener('click', () => {
  widget.setApartment('penthouse');
});

// Программное открытие модального окна заявки:
widget.openLeadModal();

// Смена темы день/ночь:
widget.setTheme('dark');
```

---

## 5. Способ 3: Двусторонний PostMessage API

Позволяет сайту девелопера и 3D-виджету обмениваться событиями и командами в реальном времени.

### Исходящие события из виджета в родительское окно (Events):

| Событие | Данные (`payload`) | Назначение |
|---|---|---|
| `flat:ready` | `{ preset, brand, primaryColor, theme }` | 3D сцена полностью загрузилась |
| `flat:lead_submitted` | `{ name, phone, comment, sceneId, brand }` | Покупатель оставил заявку (для отправки в Метрику / CRM) |
| `flat:apartment_changed` | `{ id }` | Пользователь переключил планировку |
| `flat:mode_changed` | `{ mode: 'editor' \| 'bakedOrbit' \| 'bakedWalk' \| 'panoramas' }` | Пользователь сменил режим просмотра |
| `flat:passport_downloaded` | `{ apartmentTitle, area, clientName, clientPhone }` | Скачан PDF дизайн-паспорт |

#### Пример отслеживания конверсий в Яндекс.Метрике и GA4:

```javascript
window.addEventListener('message', (event) => {
  if (event.data?.source !== 'flat-builder') return;

  switch (event.data.type) {
    case 'flat:lead_submitted':
      // Цель в Яндекс.Метрику
      if (typeof ym !== 'undefined') {
        ym(XXXXXX, 'reachGoal', 'flat_3d_lead');
      }
      // Цель в Google Analytics 4
      if (typeof gtag !== 'undefined') {
        gtag('event', 'generate_lead', {
          event_category: '3d_configurator',
          apartment: event.data.payload.sceneId
        });
      }
      break;

    case 'flat:passport_downloaded':
      if (typeof ym !== 'undefined') {
        ym(XXXXXX, 'reachGoal', 'flat_pdf_passport');
      }
      break;
  }
});
```

### Входящие команды в виджет из родительского окна (Commands):

```javascript
const iframe = document.querySelector('iframe');

function sendToWidget(type, payload) {
  iframe.contentWindow.postMessage({ type, payload }, '*');
}

// 1. Выбрать квартиру:
sendToWidget('flat:set_apartment', { sceneId: 'studio' });

// 2. Сменить цветовую тему:
sendToWidget('flat:set_theme', { theme: 'light' }); // 'dark' | 'light'

// 3. Сменить акцентный цвет бренда:
sendToWidget('flat:set_color', { color: '#0ea5e9' });

// 4. Сменить освещение:
sendToWidget('flat:set_atmosphere', { mode: 'sunset' }); // 'day' | 'sunset' | 'night'

// 5. Открыть форму заявки:
sendToWidget('flat:open_lead_modal');
```

---

## 6. Интеграция с CRM (Bitrix24, AmoCRM, Webhooks)

Когда покупатель оставляет заявку или скачивает PDF-паспорт:
1. Заявка сохраняется в базе данных платформы FlatBuilder.
2. Отправляется событие `flat:lead_submitted` в окно родительского сайта.
3. Если указан параметр `webhook` (или настроена переменная окружения `BITRIX_WEBHOOK_URL`), сервер FlatBuilder мгновенно отправляет HTTP POST запрос с полными данными:

```json
{
  "leadId": "f7d8a92b-8a71-4a11-89ce-192a8e71b29a",
  "name": "Константин",
  "phone": "+7 (999) 123-45-67",
  "comment": "Интересует семейная ипотека | [ЖК / Бренд: ЖК Горизонт] | [URL: https://site.ru/flats/14]",
  "brand": "ЖК Горизонт",
  "sourceUrl": "https://site.ru/flats/14",
  "sceneId": "euro2",
  "shareToken": "e719c8f2",
  "createdAt": "2026-09-17T01:00:00.000Z"
}
```

Маркетологи также могут в 1 клик выгрузить все накопленные лиды в формате CSV через эндпоинт `/api/leads/export`.
