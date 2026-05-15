# iskra-game — Electron Launcher

Запуск ритм-игры iskra-game через Electron.

## Быстрый старт (Development)

1. **Установи зависимости основного проекта** (из корня репозитория):
   ```bash
   bun install
   ```

2. **Запусти Next.js dev-сервер** (из корня репозитория):
   ```bash
   bun run dev
   ```

3. **Установи зависимости Electron** (из папки `electron/`):
   ```bash
   cd electron
   npm install
   ```

4. **Запусти Electron** (из папки `electron/`):
   ```bash
   NODE_ENV=development npm start
   ```

Electron откроет окно и загрузит `http://localhost:3000` — тот же dev-сервер Next.js.

## Production Build

1. **Собери Next.js** (из корня репозитория):
   ```bash
   bun run build
   ```

2. **Собери Electron-пакет** (из папки `electron/`):
   ```bash
   cd electron
   npm run dist
   ```

   Готовый установщик будет в `electron/dist/`.

## Структура

```
electron/
├── electron-main.js   — главный процесс Electron
├── preload.js         — preload-скрипт (safe API)
├── package.json       — зависимости Electron + electron-builder конфиг
└── README.md          — этот файл
```

## Примечания

- Electron загружает `http://localhost:3000` — Next.js сервер должен быть запущен
- Для production используется standalone-сервер Next.js, запускаемый автоматически
- Минимальный размер окна: 800×600
- Если нужна консоль разработчика — раскомментируй строку `openDevTools()` в `electron-main.js`
