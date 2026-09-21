/**
 * Faza 9A: UI matnlari bitta joyda.
 * t('key') yoki t('key', {name: 'x'}) — oddiy {name} almashtirish.
 */
(function (global) {
  'use strict';

  var STR = {
    toast_music_added: "Musiqa qo'shildi",
    toast_music_failed: "Musiqani yuklab bo'lmadi",
    toast_clip_deleted: "Clip o'chirildi",
    toast_export_need_media: "Export qilish uchun video/rasm qo'shing",
    toast_export_error: "Export xatosi: {msg}",
    toast_export_done: "Export tayyor!",
    toast_save_failed: "Saqlab bo'lmadi — internetni tekshir yoki qayta kirib ko'r",
    toast_format_unsupported: "Bu formatni brauzer o'qiy olmadi (HEVC?). MP4 (H.264) ga aylantirib ko'ring",
    toast_fit: "Fit: {mode}",
    toast_float_audio_on: "Float ovozi yoqildi",
    toast_float_audio_off: "Float ovozi o'chirildi",
    toast_project_stolen: "Boshqa kompyuter bu loyihani ochib yubordi",
    toast_min_one_clip: "Kamida 1 ta clip qolishi kerak",
    toast_select_clip: "Clip tanlang",
    toast_split_need_playhead: "Playhead clip ichida bo'lishi kerak",
    toast_split_done: "Split qilindi",

    onboarding_title: "Tez boshlash",
    onboarding_skip: "O'tkazib yuborish",
    onboarding_next: "Keyingi",
    onboarding_done: "Boshlash",
    onboarding_step1_title: "Fayl tashlang",
    onboarding_step1_body: "Video yoki rasmni bu yerga tashlang yoki qo'shish tugmasini bosing.",
    onboarding_step2_title: "Timeline'da kesing",
    onboarding_step2_body: "Playheadni siljiting, Split (S) bilan bo'ling, ortiqchasini o'chiring.",
    onboarding_step3_title: "Eksport",
    onboarding_step3_body: "Tayyor bo'lgach Eksport tugmasini bosing — natija MP4 bo'ladi.",
    dashboard_empty_title: "Birinchi videongizni tashlang",
    dashboard_empty_body: "Telefon yoki kompyuterdan video/rasm tashlang — montaj shu yerda boshlanadi.",

    CAPTION_QUALITY_NOTE: "Sifat o'zbek tilida o'zgaruvchan bo'lishi mumkin, natijani tekshiring",
    SUBTITLES: "Subtitrlar",
    IMPORT_SRT: "SRT/VTT import",
    EXPORT_SRT: "SRT yuklab olish",
    EXPORT_VTT: "VTT yuklab olish",
    TAP_SYNC: "Bosib sinxronla",
    PASTE_SPLIT: "Matnni yopishtir va bo'l",
    AUTO_CAPTION: "Avto-subtitr (beta)",
    APOSTROPHE_HELP: "O'zbek apostroflarini standartlash (evristika, xato bo'lishi mumkin)",
    ESTIMATED_WORDS: "So'z vaqtlari taxminiy",
    FONT_FALLBACK: "Shrift yuklanmaguncha tizim shrifti ko'rinadi",

    app_name: "EMR VideoEditor",

    btn_signout: "Chiqish",
    btn_login: "Kirish",
    btn_export: "Eksport",
    btn_undo: "Bekor qilish",
    btn_redo: "Qaytarish",
    btn_split: "Bo‘lish",
    btn_delete: "O‘chirish",
    btn_copy: "Nusxa olish",
    btn_paste: "Yopishtirish",
    label_projects: "Loyihalar",
    label_timeline: "Vaqt chizig‘i",
    label_duration: "Davomiylik",
    label_speed: "Tezlik",
    label_transition: "O‘tish",
    guest_badge: "Mehmon",
    processing: "Ishlanmoqda...",

    app_description: "Brauzerda tez video montaj — kesish, transition, matn, musiqa, export. O'zbekcha.",
  };

  function t(key, vars) {
    var s = Object.prototype.hasOwnProperty.call(STR, key) ? STR[key] : null;
    if (s == null) {
      try { console.warn('[EMR strings] missing key:', key); } catch (_) {}
      return key;
    }
    if (vars && typeof vars === 'object') {
      s = String(s).replace(/\{(\w+)\}/g, function (_, k) {
        return vars[k] != null ? String(vars[k]) : '{' + k + '}';
      });
    }
    return s;
  }

  global.EMR_STRINGS = STR;
  global.STR = STR;
  global.t = t;
  global.emrT = t;
})(typeof window !== 'undefined' ? window : globalThis);
