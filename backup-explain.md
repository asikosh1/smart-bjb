# Backup — не, қайда, как қалпына келтіру

## Не бэкап жасалады
- Бүкіл жоба папкасы `smart-bjb/` — код + mock дерек + бэкаптар
- Mock режимде (`?mock=1`) барлық дерек `localStorage` кілті `smart-bjb:mock-db` ішінде JSON ретінде сақталады

## Қалай бэкап жасау
### Windows-та екі рет басу
`backup.bat` екі рет бас → `backups/smart-bjb-backup-YYYY-MM-DD_HH-mm.zip` шығады

### Браузерден (кез келген бетте, консоль)
```js
__SMART_BJB_BACKUP__.downloadBackup()  // smart-bjb-backup-YYYY-MM-DD.json жүктеледі
__SMART_BJB_MOCK__.export()            // JSON көшіру
```

## Қалай қалпына келтіру
### Файл бэкапы
zip-ті ашып, ішіндегіні `smart-bjb/` орнына қой

### Mock дерек
```js
// 1) JSON-ды көшіріп
const json = `... бэкап JSON ...`;
__SMART_BJB_MOCK__.import(json)  // автоматты reload

// 2) Немесе тазалау
localStorage.removeItem("smart-bjb:mock-db")
localStorage.removeItem("smart-bjb:useMock")
location.reload()
```

### Firebase дерек
Firebase → Firestore → қолмен импорт немесе CLI:
```bash
firebase firestore:import backups/...
```
Нақты проект үшін Firestore export/import Firebase Console-дан жасалады.

## Ұсыныс
- Ғылыми жоба қорғау алдында: `backup.bat` + `__SMART_BJB_BACKUP__.downloadBackup()` екеуін де жаса
- Mock пен нақты Firebase — екі бөлек сақтау. Mock тек демо/тест үшін, нақты баға Firebase-те.
