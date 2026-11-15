import { getLanguage } from "obsidian";

/*
 * The plugin's text in English, Russian and Georgian. It follows Obsidian's own language (Settings → General →
 * Language), and any other language gets English. Obsidian restarts when its language changes, so it's read once.
 */

/*
 * Words for the repeat phrases ("every week on Sunday", "every year on November 15"), in the form each sentence
 * needs: Russian weekdays with their preposition and months in the genitive, Georgian weekdays and months in the
 * dative. Weekdays start from Sunday. The companion app has the same phrases in its strings.xml.
 */
const EN_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const RU_ON_WEEKDAYS = ["в воскресенье", "в понедельник", "во вторник", "в среду", "в четверг", "в пятницу", "в субботу"];
const RU_MONTHS_GENITIVE = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const KA_WEEKDAYS_DATIVE = ["კვირას", "ორშაბათს", "სამშაბათს", "ოთხშაბათს", "ხუთშაბათს", "პარასკევს", "შაბათს"];
const KA_MONTHS_DATIVE = ["იანვარს", "თებერვალს", "მარტს", "აპრილს", "მაისს", "ივნისს", "ივლისს", "აგვისტოს", "სექტემბერს", "ოქტომბერს", "ნოემბერს", "დეკემბერს"];

/** "1st", "2nd", "3rd", "11th", "22nd". */
function englishOrdinal(n: number): string {
	const teen = n % 100 >= 11 && n % 100 <= 13;
	return `${n}${teen ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
}

const en = {
	ribbon: {
		openNotes: "Open colored notes",
	},
	commands: {
		openNotesList: "Open colored notes list",
		setColor: "Set note color",
		togglePinned: "Pin or unpin note at the top",
		setReminder: "Set or edit reminder",
		removeReminder: "Remove reminder",
		toggleStatusBarPin: "Pin or unpin note in the status bar",
		setReminderWithSelection: "Set reminder with selected text",
		useSelectionAsSubtitle: "Use selected text as notification subtitle",
		sendToCompanion: "Send reminders to the companion app",
	},
	menu: {
		setColor: "Set color…",
		pinToTop: "Pin to the top",
		unpinFromTop: "Unpin from the top",
		setReminder: "Set reminder…",
		editReminder: "Edit reminder…",
		setReminderWithText: "Set reminder with this text…",
		useAsSubtitle: "Use as notification subtitle",
	},
	notices: {
		subtitleSet: (subtitle: string) => `Notification subtitle: ${subtitle}`,
		subtitleRemoved: "Notification subtitle removed.",
		noteMissing: "Note Pin: that note no longer exists.",
	},
	colors: {
		red: "Red",
		orange: "Orange",
		yellow: "Yellow",
		green: "Green",
		blue: "Blue",
		purple: "Purple",
		gray: "Gray",
		black: "Black",
		white: "White",
	},
	colorModal: {
		title: "Note color",
		none: "None",
	},
	reminderModal: {
		setTitle: "Set reminder",
		editTitle: "Edit reminder",
		notificationText: (text: string) => `Notification text: ${text}`,
		type: "Type",
		types: {
			time: "At a time",
			allday: "All day",
			statusbar: "Pin to the status bar (Android)",
		},
		statusbarHelp: "Shows the note as a persistent notification on Android until you remove the pin. Tapping it opens the note.",
		date: "Date",
		time: "Time",
		allDayHelp: (time: string) =>
			`Notifies at ${time} on the day. On Android it then stays in the notification bar until the end of the day. Change the time in the plugin settings.`,
		repeat: "Repeat",
		repeats: {
			none: "Doesn't repeat",
			daily: "Every day",
			weekly: "Every week",
			biweekly: "Every 2 weeks",
			monthly: "Every month",
			yearly: "Every year",
		},
		until: "Repeat until",
		untilDesc: "Leave it empty to keep repeating.",
		invalidUntil: "The end date can't be before the reminder's date.",
		remove: "Remove reminder",
		cancel: "Cancel",
		save: "Save",
		invalidDate: "Pick a valid date and time.",
	},
	reminder: {
		pinned: "Pinned to the status bar",
		pinnedOnAndroid: "Pinned to the status bar on Android",
		fallback: "Reminder",
		allDay: (date: string) => `All day: ${date}`,
		daily: "every day",
		/** `weekday` 0 for Sunday to 6 for Saturday. */
		weeklyOn: (weekday: number) => `every week on ${EN_WEEKDAYS[weekday]}`,
		biweeklyOn: (weekday: number) => `every 2 weeks on ${EN_WEEKDAYS[weekday]}`,
		/** A day after the 28th falls on the last day of shorter months. */
		monthlyOn: (day: number) =>
			`every month on the ${englishOrdinal(day)}${day > 28 ? " (or the last day of shorter months)" : ""}`,
		/** `month` 1–12. 29 February falls on the 28th in other years. */
		yearlyOn: (month: number, day: number) =>
			month === 2 && day === 29
				? "every year on February 29 (February 28 in other years)"
				: `every year on ${EN_MONTHS[month - 1]} ${day}`,
		/** `nth` 1–4, or 5 for the last. */
		monthlyWeekday: (nth: number, weekday: number) =>
			`every month on the ${["first", "second", "third", "fourth", "last"][nth - 1]} ${EN_WEEKDAYS[weekday]}`,
		yearlyLunar: (date: string) => `every year by the Chinese lunar calendar (${date})`,
		lunarDate: (month: number, leap: boolean, day: number) => `${leap ? "leap month" : "month"} ${month}, day ${day}`,
		until: (date: string) => `until ${date}`,
		ended: (date: string) => `Repeated until ${date}`,
		shown: (when: string) => `Reminder shown ${when}`,
		wasDue: (when: string) => `Was due ${when}`,
		missed: "Missed reminder",
		missedWith: (text: string) => `Missed reminder: ${text}`,
	},
	banner: {
		edit: "Edit",
		remove: "Remove",
	},
	notesView: {
		title: "Colored notes",
		search: "Search notes",
		noMatch: "No notes match.",
		empty: "No notes here yet.",
		showMore: (left: number) => `Show more (${left} left)`,
		pinned: "Pinned",
		filters: {
			all: "All notes",
			colored: "Colored",
			reminders: "With reminders",
			pinned: "Pinned",
		},
		sorts: {
			modified: "Recently edited",
			title: "Title",
			color: "Color",
			reminder: "Next reminder",
		},
	},
	explorer: {
		pinned: "Pinned",
	},
	settings: {
		colorsHeading: "Colors and pins",
		explorerColors: "Colors in the file explorer",
		explorerColorsDesc: "How a note's color shows in the file explorer.",
		explorerColorsOptions: {
			tint: "Tinted background",
			text: "Colored text",
			off: "Off",
		},
		explorerPinned: "Pinned notes at the top of the file explorer",
		explorerPinnedDesc: "Notes pinned to the top also appear in a Pinned section above the file explorer's folders.",
		sortByColor: "Sort the file explorer by color",
		sortByColorDesc:
			"Experimental: within each folder, colored notes come first, in palette order. This changes Obsidian's file explorer in a way Obsidian doesn't officially support, so an Obsidian update can break it. The Colored notes list always offers sorting by color.",
		remindersHeading: "Reminders",
		allDayTime: "Time for all-day reminders",
		allDayTimeDesc: "All-day reminders notify at this time on their day.",
		showContent: "Show note text in notifications",
		showContentDesc: "Off: notifications show only the note's title and its notification subtitle.",
		desktop: "Show reminders on this computer",
		desktopDesc: "Notifies while Obsidian is open here. Reminders that came due while it was closed show when it opens.",
		companionHeading: "Android companion app",
		appName: "Note Pin for Obsidian",
		appDescAndroid: "The app that shows your reminders and status bar pins on this phone. Obsidian sends them to it.",
		appDescDesktop:
			"On Android, notifications and status bar pins come from this app. Obsidian on the phone sends them to it, so reminders you set here reach the phone once your vault syncs and Obsidian opens there.",
		getTheApp: "Get the app: ",
		sendAutomatically: "Send to the app automatically",
		sendAutomaticallyDesc:
			"When Obsidian opens or comes back to the screen, and when a reminder changes. Edits to a note's text go out the next time Obsidian opens.",
		connection: "Connection",
		confirmed: (date: string) => `The app last confirmed your reminders on ${date}.`,
		notConfirmed: "The app hasn't confirmed any reminders yet.",
		lastProblem: (problem: string) => `Last problem: ${problem}`,
		sendNow: "Send now",
		resetConnection: "Reset connection",
		connectionReset: "Connection reset. The app will ask you to allow this vault again on the next send.",
		aboutHeading: "About",
		/** The text before and after the developer's name, which is a link. */
		madeBy: ["Made with 🤖 by ", ""],
		kofi: "☕ Support me on Ko-fi",
	},
	companion: {
		noReply: "the app didn't reply. Is the Note Pin for Obsidian app installed?",
		notAllowed: "the app wasn't allowed to receive reminders from this vault.",
		unreadable: (error: string) => `the app couldn't read the reminders (${error}).`,
		damaged: "the reminders arrived damaged. Try sending again.",
		notificationsOff: "notifications are turned off for the app, so reminders won't show. Open the app to fix it.",
		appWarning: (warning: string) => `Note Pin for Obsidian: ${warning}`,
		sent: (count: number) => `Sent ${count} ${count === 1 ? "reminder" : "reminders"} to Note Pin for Obsidian.`,
		sendFailed: (problem: string) => `Couldn't send to Note Pin for Obsidian: ${problem}`,
	},
};

type Messages = typeof en;

const ru: Messages = {
	ribbon: {
		openNotes: "Открыть цветные заметки",
	},
	commands: {
		openNotesList: "Открыть список цветных заметок",
		setColor: "Задать цвет заметки",
		togglePinned: "Закрепить заметку вверху или открепить её",
		setReminder: "Задать или изменить напоминание",
		removeReminder: "Удалить напоминание",
		toggleStatusBarPin: "Закрепить заметку в строке состояния или открепить её",
		setReminderWithSelection: "Задать напоминание с выделенным текстом",
		useSelectionAsSubtitle: "Сделать выделенный текст подзаголовком уведомления",
		sendToCompanion: "Отправить напоминания в приложение-компаньон",
	},
	menu: {
		setColor: "Задать цвет…",
		pinToTop: "Закрепить вверху",
		unpinFromTop: "Открепить сверху",
		setReminder: "Задать напоминание…",
		editReminder: "Изменить напоминание…",
		setReminderWithText: "Напоминание с этим текстом…",
		useAsSubtitle: "Сделать подзаголовком уведомления",
	},
	notices: {
		subtitleSet: (subtitle: string) => `Подзаголовок уведомления: ${subtitle}`,
		subtitleRemoved: "Подзаголовок уведомления удалён.",
		noteMissing: "Note Pin: этой заметки больше нет.",
	},
	colors: {
		red: "Красный",
		orange: "Оранжевый",
		yellow: "Жёлтый",
		green: "Зелёный",
		blue: "Синий",
		purple: "Фиолетовый",
		gray: "Серый",
		black: "Чёрный",
		white: "Белый",
	},
	colorModal: {
		title: "Цвет заметки",
		none: "Без цвета",
	},
	reminderModal: {
		setTitle: "Задать напоминание",
		editTitle: "Изменить напоминание",
		notificationText: (text: string) => `Текст уведомления: ${text}`,
		type: "Тип",
		types: {
			time: "В заданное время",
			allday: "На весь день",
			statusbar: "Закрепить в строке состояния (Android)",
		},
		statusbarHelp:
			"Показывает заметку на Android как постоянное уведомление, пока вы не открепите её. Нажатие на уведомление открывает заметку.",
		date: "Дата",
		time: "Время",
		allDayHelp: (time: string) =>
			`Напомнит в этот день в ${time}, а на Android останется в шторке уведомлений до конца дня. Время можно изменить в настройках плагина.`,
		repeat: "Повтор",
		repeats: {
			none: "Не повторять",
			daily: "Каждый день",
			weekly: "Каждую неделю",
			biweekly: "Каждые 2 недели",
			monthly: "Каждый месяц",
			yearly: "Каждый год",
		},
		until: "Повторять до",
		untilDesc: "Оставьте пустым, чтобы повторять без конца.",
		invalidUntil: "Дата окончания не может быть раньше даты напоминания.",
		remove: "Удалить напоминание",
		cancel: "Отмена",
		save: "Сохранить",
		invalidDate: "Укажите правильные дату и время.",
	},
	reminder: {
		pinned: "Закреплена в строке состояния",
		pinnedOnAndroid: "Закреплена в строке состояния на Android",
		fallback: "Напоминание",
		allDay: (date: string) => `Весь день: ${date}`,
		daily: "каждый день",
		weeklyOn: (weekday: number) => `каждую неделю ${RU_ON_WEEKDAYS[weekday]}`,
		biweeklyOn: (weekday: number) => `каждые 2 недели ${RU_ON_WEEKDAYS[weekday]}`,
		monthlyOn: (day: number) =>
			`каждый месяц ${day}-го числа${day > 28 ? " (в более коротких месяцах — в последний день)" : ""}`,
		yearlyOn: (month: number, day: number) =>
			month === 2 && day === 29
				? "каждый год 29 февраля (в остальные годы 28 февраля)"
				: `каждый год ${day} ${RU_MONTHS_GENITIVE[month - 1]}`,
		monthlyWeekday: (nth: number, weekday: number) => {
			// The ordinal agrees with the weekday's gender: "в первый понедельник", "во вторую среду", "в третье воскресенье".
			const days = ["воскресенье", "понедельник", "вторник", "среду", "четверг", "пятницу", "субботу"];
			const ordinals = [
				["первый", "второй", "третий", "четвёртый", "последний"],
				["первую", "вторую", "третью", "четвёртую", "последнюю"],
				["первое", "второе", "третье", "четвёртое", "последнее"],
			][[2, 0, 0, 1, 0, 1, 1][weekday]];
			return `каждый месяц ${nth === 2 ? "во" : "в"} ${ordinals[nth - 1]} ${days[weekday]}`;
		},
		yearlyLunar: (date: string) => `каждый год по китайскому лунному календарю (${date})`,
		lunarDate: (month: number, leap: boolean, day: number) => `${leap ? "вставной " : ""}${month}-й месяц, ${day}-й день`,
		until: (date: string) => `до ${date}`,
		ended: (date: string) => `Повторялось до ${date}`,
		shown: (when: string) => `Напоминание показано: ${when}`,
		wasDue: (when: string) => `Просрочено: ${when}`,
		missed: "Пропущенное напоминание",
		missedWith: (text: string) => `Пропущенное напоминание: ${text}`,
	},
	banner: {
		edit: "Изменить",
		remove: "Удалить",
	},
	notesView: {
		title: "Цветные заметки",
		search: "Поиск заметок",
		noMatch: "Подходящих заметок нет.",
		empty: "Здесь пока нет заметок.",
		showMore: (left: number) => `Показать ещё (осталось: ${left})`,
		pinned: "Закреплена",
		filters: {
			all: "Все заметки",
			colored: "Цветные",
			reminders: "С напоминаниями",
			pinned: "Закреплённые",
		},
		sorts: {
			modified: "Недавно изменённые",
			title: "Название",
			color: "Цвет",
			reminder: "Ближайшее напоминание",
		},
	},
	explorer: {
		pinned: "Закреплённые",
	},
	settings: {
		colorsHeading: "Цвета и закрепление",
		explorerColors: "Цвета в проводнике",
		explorerColorsDesc: "Как цвет заметки показывается в проводнике.",
		explorerColorsOptions: {
			tint: "Цветной фон",
			text: "Цветной текст",
			off: "Выключено",
		},
		explorerPinned: "Закреплённые заметки вверху проводника",
		explorerPinnedDesc: "Заметки, закреплённые вверху, также появляются в разделе «Закреплённые» над папками проводника.",
		sortByColor: "Сортировать проводник по цвету",
		sortByColorDesc:
			"Экспериментально: в каждой папке сначала идут цветные заметки, в порядке палитры. Это меняет проводник Obsidian способом, который Obsidian официально не поддерживает, поэтому обновление Obsidian может это сломать. В списке цветных заметок сортировка по цвету есть всегда.",
		remindersHeading: "Напоминания",
		allDayTime: "Время напоминаний на весь день",
		allDayTimeDesc: "Напоминания на весь день приходят в своё число в это время.",
		showContent: "Показывать текст заметки в уведомлениях",
		showContentDesc: "Если выключено, уведомления показывают только название заметки и подзаголовок уведомления.",
		desktop: "Показывать напоминания на этом компьютере",
		desktopDesc:
			"Уведомляет, пока здесь открыт Obsidian. Напоминания, время которых пришло, пока он был закрыт, появятся при запуске.",
		companionHeading: "Приложение для Android",
		appName: "Note Pin для Obsidian",
		appDescAndroid: "Приложение, которое показывает ваши напоминания и закреплённые заметки на этом телефоне. Obsidian отправляет их в него.",
		appDescDesktop:
			"На Android уведомления и закреплённые в строке состояния заметки показывает это приложение. Obsidian на телефоне отправляет их в него, поэтому напоминания, заданные здесь, попадут на телефон, когда хранилище синхронизируется и вы откроете там Obsidian.",
		getTheApp: "Скачать приложение: ",
		sendAutomatically: "Отправлять в приложение автоматически",
		sendAutomaticallyDesc:
			"Когда Obsidian открывается или возвращается на экран и когда меняется напоминание. Изменения текста заметки уходят при следующем запуске Obsidian.",
		connection: "Соединение",
		confirmed: (date: string) => `Приложение последний раз подтвердило ваши напоминания ${date}.`,
		notConfirmed: "Приложение пока не подтвердило ни одного напоминания.",
		lastProblem: (problem: string) => `Последняя проблема: ${problem}`,
		sendNow: "Отправить сейчас",
		resetConnection: "Сбросить соединение",
		connectionReset: "Соединение сброшено. При следующей отправке приложение снова спросит, разрешить ли это хранилище.",
		aboutHeading: "О плагине",
		madeBy: ["Сделал ", " с помощью 🤖"],
		kofi: "☕ Поддержать меня на Ko-fi",
	},
	companion: {
		noReply: "приложение не ответило. Установлено ли приложение Note Pin для Obsidian?",
		notAllowed: "приложению не разрешено получать напоминания из этого хранилища.",
		unreadable: (error: string) => `приложение не смогло прочитать напоминания (${error}).`,
		damaged: "напоминания пришли повреждёнными. Попробуйте отправить ещё раз.",
		notificationsOff:
			"уведомления для приложения выключены, поэтому напоминания не появятся. Откройте приложение, чтобы это исправить.",
		appWarning: (warning: string) => `Note Pin для Obsidian: ${warning}`,
		sent: (count: number) => `Отправлено в Note Pin для Obsidian: ${count} ${ruPlural(count, "напоминание", "напоминания", "напоминаний")}.`,
		sendFailed: (problem: string) => `Не удалось отправить в Note Pin для Obsidian: ${problem}`,
	},
};

const ka: Messages = {
	ribbon: {
		openNotes: "ფერადი ჩანაწერების გახსნა",
	},
	commands: {
		openNotesList: "ფერადი ჩანაწერების სიის გახსნა",
		setColor: "ჩანაწერის ფერის არჩევა",
		togglePinned: "ჩანაწერის ზემოთ მიმაგრება ან მოხსნა",
		setReminder: "შეხსენების დაყენება ან შეცვლა",
		removeReminder: "შეხსენების წაშლა",
		toggleStatusBarPin: "ჩანაწერის სტატუსის ზოლზე მიმაგრება ან მოხსნა",
		setReminderWithSelection: "შეხსენების დაყენება მონიშნული ტექსტით",
		useSelectionAsSubtitle: "მონიშნული ტექსტის შეტყობინების ქვესათაურად გამოყენება",
		sendToCompanion: "შეხსენებების გაგზავნა დამხმარე აპში",
	},
	menu: {
		setColor: "ფერის არჩევა…",
		pinToTop: "ზემოთ მიმაგრება",
		unpinFromTop: "ზემოდან მოხსნა",
		setReminder: "შეხსენების დაყენება…",
		editReminder: "შეხსენების შეცვლა…",
		setReminderWithText: "შეხსენება ამ ტექსტით…",
		useAsSubtitle: "შეტყობინების ქვესათაურად გამოყენება",
	},
	notices: {
		subtitleSet: (subtitle: string) => `შეტყობინების ქვესათაური: ${subtitle}`,
		subtitleRemoved: "შეტყობინების ქვესათაური წაიშალა.",
		noteMissing: "Note Pin: ეს ჩანაწერი აღარ არსებობს.",
	},
	colors: {
		red: "წითელი",
		orange: "ნარინჯისფერი",
		yellow: "ყვითელი",
		green: "მწვანე",
		blue: "ლურჯი",
		purple: "იისფერი",
		gray: "ნაცრისფერი",
		black: "შავი",
		white: "თეთრი",
	},
	colorModal: {
		title: "ჩანაწერის ფერი",
		none: "ფერის გარეშე",
	},
	reminderModal: {
		setTitle: "შეხსენების დაყენება",
		editTitle: "შეხსენების შეცვლა",
		notificationText: (text: string) => `შეტყობინების ტექსტი: ${text}`,
		type: "ტიპი",
		types: {
			time: "კონკრეტულ დროს",
			allday: "მთელი დღე",
			statusbar: "სტატუსის ზოლზე მიმაგრება (Android)",
		},
		statusbarHelp:
			"Android-ზე ჩანაწერს მუდმივ შეტყობინებად აჩვენებს, სანამ მიმაგრებას არ მოხსნით. შეტყობინებაზე შეხება ჩანაწერს გახსნის.",
		date: "თარიღი",
		time: "დრო",
		allDayHelp: (time: string) =>
			`შეგახსენებთ იმ დღეს, ${time}-ზე, Android-ზე კი შეტყობინება დღის ბოლომდე დარჩება. დროის შეცვლა პლაგინის პარამეტრებშია შესაძლებელი.`,
		repeat: "გამეორება",
		repeats: {
			none: "არ მეორდება",
			daily: "ყოველდღე",
			weekly: "ყოველკვირა",
			biweekly: "ორ კვირაში ერთხელ",
			monthly: "ყოველთვე",
			yearly: "ყოველწლიურად",
		},
		until: "გამეორების ბოლო დღე",
		untilDesc: "დატოვეთ ცარიელი, რომ გამეორება არ დასრულდეს.",
		invalidUntil: "ბოლო დღე შეხსენების თარიღზე ადრე ვერ იქნება.",
		remove: "შეხსენების წაშლა",
		cancel: "გაუქმება",
		save: "შენახვა",
		invalidDate: "აირჩიეთ სწორი თარიღი და დრო.",
	},
	reminder: {
		pinned: "მიმაგრებულია სტატუსის ზოლზე",
		pinnedOnAndroid: "მიმაგრებულია Android-ის სტატუსის ზოლზე",
		fallback: "შეხსენება",
		allDay: (date: string) => `მთელი დღე: ${date}`,
		daily: "ყოველდღე",
		weeklyOn: (weekday: number) => `ყოველკვირა, ${KA_WEEKDAYS_DATIVE[weekday]}`,
		biweeklyOn: (weekday: number) => `ორ კვირაში ერთხელ, ${KA_WEEKDAYS_DATIVE[weekday]}`,
		monthlyOn: (day: number) => `ყოველი თვის ${day} რიცხვში${day > 28 ? " (უფრო მოკლე თვეებში — ბოლო დღეს)" : ""}`,
		yearlyOn: (month: number, day: number) =>
			month === 2 && day === 29
				? "ყოველწლიურად, 29 თებერვალს (სხვა წლებში 28 თებერვალს)"
				: `ყოველწლიურად, ${day} ${KA_MONTHS_DATIVE[month - 1]}`,
		monthlyWeekday: (nth: number, weekday: number) =>
			`ყოველი თვის ${["პირველ", "მეორე", "მესამე", "მეოთხე", "ბოლო"][nth - 1]} ${KA_WEEKDAYS_DATIVE[weekday]}`,
		yearlyLunar: (date: string) => `ყოველწლიურად ჩინური მთვარის კალენდრით (${date})`,
		lunarDate: (month: number, leap: boolean, day: number) => `${leap ? "დამატებითი თვე" : "თვე"} ${month}, დღე ${day}`,
		until: (date: string) => `ბოლო დღე: ${date}`,
		ended: (date: string) => `გამეორება დასრულდა: ${date}`,
		shown: (when: string) => `შეხსენება ნაჩვენებია: ${when}`,
		wasDue: (when: string) => `ვადა გაუვიდა: ${when}`,
		missed: "გამოტოვებული შეხსენება",
		missedWith: (text: string) => `გამოტოვებული შეხსენება: ${text}`,
	},
	banner: {
		edit: "შეცვლა",
		remove: "წაშლა",
	},
	notesView: {
		title: "ფერადი ჩანაწერები",
		search: "ჩანაწერების ძიება",
		noMatch: "შესაბამისი ჩანაწერი ვერ მოიძებნა.",
		empty: "აქ ჯერ ჩანაწერები არ არის.",
		showMore: (left: number) => `მეტის ჩვენება (დარჩა ${left})`,
		pinned: "მიმაგრებული",
		filters: {
			all: "ყველა ჩანაწერი",
			colored: "ფერადი",
			reminders: "შეხსენებებით",
			pinned: "მიმაგრებული",
		},
		sorts: {
			modified: "ბოლოს შეცვლილი",
			title: "სათაური",
			color: "ფერი",
			reminder: "შემდეგი შეხსენება",
		},
	},
	explorer: {
		pinned: "მიმაგრებული",
	},
	settings: {
		colorsHeading: "ფერები და მიმაგრება",
		explorerColors: "ფერები ფაილების მენეჯერში",
		explorerColorsDesc: "როგორ ჩანს ჩანაწერის ფერი ფაილების მენეჯერში.",
		explorerColorsOptions: {
			tint: "შეფერილი ფონი",
			text: "ფერადი ტექსტი",
			off: "გამორთული",
		},
		explorerPinned: "მიმაგრებული ჩანაწერები ფაილების მენეჯერის თავში",
		explorerPinnedDesc: "ზემოთ მიმაგრებული ჩანაწერები ასევე ჩანს „მიმაგრებულის“ განყოფილებაში, ფაილების მენეჯერის საქაღალდეების ზემოთ.",
		sortByColor: "ფაილების მენეჯერის ფერის მიხედვით დალაგება",
		sortByColorDesc:
			"ექსპერიმენტული: თითოეულ საქაღალდეში ჯერ ფერადი ჩანაწერები მოდის, პალიტრის მიმდევრობით. ეს Obsidian-ის ფაილების მენეჯერს ისე ცვლის, როგორც Obsidian ოფიციალურად არ უჭერს მხარს, ამიტომ Obsidian-ის განახლებამ შეიძლება ის გააფუჭოს. ფერადი ჩანაწერების სიაში ფერის მიხედვით დალაგება ყოველთვის არის.",
		remindersHeading: "შეხსენებები",
		allDayTime: "მთელი დღის შეხსენებების დრო",
		allDayTimeDesc: "მთელი დღის შეხსენებები თავის დღეს ამ დროს მოვა.",
		showContent: "ჩანაწერის ტექსტის ჩვენება შეტყობინებებში",
		showContentDesc: "გამორთვისას შეტყობინებები მხოლოდ ჩანაწერის სათაურს და შეტყობინების ქვესათაურს აჩვენებს.",
		desktop: "შეხსენებების ჩვენება ამ კომპიუტერზე",
		desktopDesc:
			"შეგახსენებთ, სანამ Obsidian აქ ღიაა. შეხსენებები, რომელთა დროც მისი დახურვისას დადგა, გახსნისას გამოჩნდება.",
		companionHeading: "Android-ის აპი",
		appName: "Note Pin Obsidian-ისთვის",
		appDescAndroid: "აპი, რომელიც ამ ტელეფონზე თქვენს შეხსენებებს და სტატუსის ზოლზე მიმაგრებულ ჩანაწერებს აჩვენებს. Obsidian მათ ამ აპს უგზავნის.",
		appDescDesktop:
			"Android-ზე შეტყობინებებს და სტატუსის ზოლზე მიმაგრებულ ჩანაწერებს ეს აპი აჩვენებს. ტელეფონზე Obsidian მათ ამ აპს უგზავნის, ამიტომ აქ დაყენებული შეხსენებები ტელეფონზე მაშინ მოხვდება, როცა საცავი სინქრონიზდება და იქ Obsidian-ს გახსნით.",
		getTheApp: "ჩამოტვირთეთ აპი: ",
		sendAutomatically: "აპში ავტომატურად გაგზავნა",
		sendAutomaticallyDesc:
			"როცა Obsidian იხსნება ან ეკრანზე ბრუნდება, და როცა შეხსენება იცვლება. ჩანაწერის ტექსტის ცვლილებები Obsidian-ის შემდეგი გახსნისას გაიგზავნება.",
		connection: "კავშირი",
		confirmed: (date: string) => `აპმა თქვენი შეხსენებები ბოლოს დაადასტურა: ${date}.`,
		notConfirmed: "აპს ჯერ არცერთი შეხსენება არ დაუდასტურებია.",
		lastProblem: (problem: string) => `ბოლო პრობლემა: ${problem}`,
		sendNow: "ახლავე გაგზავნა",
		resetConnection: "კავშირის გადატვირთვა",
		connectionReset: "კავშირი გადაიტვირთა. შემდეგი გაგზავნისას აპი ისევ გკითხავთ, დაუშვას თუ არა ეს საცავი.",
		aboutHeading: "შესახებ",
		madeBy: ["შექმნილია 🤖-ის დახმარებით. ავტორი: ", ""],
		kofi: "☕ დამიჭირეთ მხარი Ko-fi-ზე",
	},
	companion: {
		noReply: "აპმა არ უპასუხა. დაყენებულია აპი „Note Pin Obsidian-ისთვის“?",
		notAllowed: "აპს არ აქვს ამ საცავიდან შეხსენებების მიღების ნებართვა.",
		unreadable: (error: string) => `აპმა შეხსენებები ვერ წაიკითხა (${error}).`,
		damaged: "შეხსენებები დაზიანებული მივიდა. სცადეთ ხელახლა გაგზავნა.",
		notificationsOff: "აპისთვის შეტყობინებები გამორთულია, ამიტომ შეხსენებები არ გამოჩნდება. გასასწორებლად გახსენით აპი.",
		appWarning: (warning: string) => `Note Pin Obsidian-ისთვის: ${warning}`,
		// Georgian nouns stay singular after a number: 1 შეხსენება, 5 შეხსენება.
		sent: (count: number) => `აპში „Note Pin Obsidian-ისთვის“ გაიგზავნა ${count} შეხსენება.`,
		sendFailed: (problem: string) => `აპში „Note Pin Obsidian-ისთვის“ გაგზავნა ვერ მოხერხდა: ${problem}`,
	},
};

/** The Russian noun form for a count: 1 and 21 take `one`, 2–4 and 22–24 `few`, the rest `many`. */
function ruPlural(count: number, one: string, few: string, many: string): string {
	const rule = new Intl.PluralRules("ru").select(count);
	return rule === "one" ? one : rule === "few" ? few : many;
}

const MESSAGES: Record<string, Messages> = { en, ru, ka };

function language(): string {
	const code = getLanguage();
	const base = (code || "en").toLowerCase().split("-")[0];
	return base in MESSAGES ? base : "en";
}

const LANGUAGE = language();

export const t: Messages = MESSAGES[LANGUAGE];

/** The locale dates are written in: the plugin's language, or the device's own when that's English. */
export const DATE_LOCALE: string | undefined = LANGUAGE === "en" ? undefined : LANGUAGE;

/**
 * Starts a phrase from `t` with a capital, for a menu option. Georgian is left alone: it has no capitals in
 * running text, and toUpperCase would turn it into Mtavruli, the all-caps script.
 */
export function capitalize(text: string): string {
	return LANGUAGE === "ka" ? text : text.charAt(0).toUpperCase() + text.slice(1);
}
