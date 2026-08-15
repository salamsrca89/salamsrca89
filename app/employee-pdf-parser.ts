export type PdfTextPosition = {
  str: string;
  x: number;
  y: number;
};

export type ParsedScheduleEmployee = {
  fullName: string;
  employeeCode: string;
  teamCode: string;
  mobile: string;
  jobNature: string;
};

export type ParsedEmployeeSchedule = {
  reportYear: number;
  reportMonth: number;
  reportMonthName: string;
  employees: ParsedScheduleEmployee[];
};

const monthNumbers: Record<string, number> = {
  يناير: 1,
  فبراير: 2,
  مارس: 3,
  أبريل: 4,
  ابريل: 4,
  مايو: 5,
  يونيو: 6,
  يوليو: 7,
  أغسطس: 8,
  اغسطس: 8,
  سبتمبر: 9,
  أكتوبر: 10,
  اكتوبر: 10,
  نوفمبر: 11,
  ديسمبر: 12,
};

// The attached monthly report uses an embedded Al-Mohanad font without a
// ToUnicode map. PDF.js therefore returns the glyph index as a character.
// This map restores those glyphs to their Arabic Unicode equivalents.
const glyphMap: Record<number, string> = {
  3: " ",
  29: ":",
  271: "ء", 272: "آ", 273: "أ", 275: "إ", 277: "ا", 278: "ب",
  279: "ة", 280: "ت", 282: "ج", 283: "ح", 285: "د", 287: "ر",
  288: "ز", 289: "س", 290: "ش", 291: "ص", 292: "ض", 293: "ط",
  295: "ع", 297: "ـ", 298: "ف", 299: "ق", 300: "ك", 301: "ل",
  302: "م", 303: "ن", 304: "ه", 305: "و", 307: "ي", 308: "ً",
  330: "الله", 333: "آ", 335: "أ", 337: "ؤ", 339: "إ", 342: "ئ",
  343: "ئ", 345: "ا", 347: "ب", 348: "ب", 349: "ب", 351: "ة",
  353: "ت", 354: "ت", 355: "ت", 358: "ث", 359: "ث", 361: "ج",
  362: "ج", 363: "ج", 365: "ح", 366: "ح", 367: "ح", 369: "خ",
  370: "خ", 371: "خ", 373: "د", 375: "ذ", 377: "ر", 379: "ز",
  381: "س", 382: "س", 383: "س", 385: "ش", 386: "ش", 387: "ش",
  389: "ص", 390: "ص", 391: "ص", 393: "ض", 394: "ض", 395: "ض",
  397: "ط", 398: "ط", 399: "ط", 402: "ظ", 403: "ظ", 405: "ع",
  406: "ع", 407: "ع", 410: "غ", 411: "غ", 413: "ف", 414: "ف",
  415: "ف", 417: "ق", 418: "ق", 419: "ق", 421: "ك", 422: "ك",
  423: "ك", 425: "ل", 426: "ل", 427: "ل", 429: "م", 430: "م",
  431: "م", 433: "ن", 434: "ن", 435: "ن", 437: "ه", 438: "ه",
  439: "ه", 441: "و", 443: "ى", 445: "ي", 446: "ي", 447: "ي",
  448: "لآ", 449: "لآ", 450: "لأ", 451: "لأ", 452: "لإ", 453: "لإ",
  454: "لا", 455: "لا",
};

function cleanArabic(value: string) {
  return value
    .normalize("NFKC")
    .replace(/ـ/g, "")
    .replace(/االله/g, "الله")
    .replace(/\s+/g, " ")
    .trim();
}

export function decodePdfText(value: string) {
  const characters = Array.from(value);
  const encoded = characters.some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return Boolean(glyphMap[code]) || (code > 255 && code < 500);
  });
  if (!encoded) return cleanArabic(value.replace(/[\u0000-\u001f]/g, " "));

  const tokens: string[] = [];
  let numberToken = "";
  const flushNumber = () => {
    if (!numberToken) return;
    tokens.push(numberToken);
    numberToken = "";
  };

  for (const character of characters) {
    if (/[0-9/.:+-]/.test(character)) {
      numberToken += character;
      continue;
    }
    flushNumber();
    const code = character.codePointAt(0) ?? 0;
    tokens.push(glyphMap[code] ?? (code < 32 ? " " : character));
  }
  flushNumber();
  return cleanArabic(tokens.reverse().join(""));
}

function combineColumn(
  rows: PdfTextPosition[],
  minimumX: number,
  maximumX: number,
  top: number,
  bottom: number,
) {
  return rows
    .filter((item) => item.x >= minimumX && item.x < maximumX && item.y <= top && item.y > bottom)
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((item) => decodePdfText(item.str))
    .filter(Boolean)
    .join(" ");
}

function parsePageEmployees(items: PdfTextPosition[]) {
  const anchors = items
    .map((item) => ({ ...item, decoded: decodePdfText(item.str) }))
    .filter(
      (item) =>
        item.x >= 665 &&
        item.x < 690 &&
        /^\d{3,6}$/.test(item.decoded),
    )
    .sort((a, b) => b.y - a.y);

  return anchors.map((anchor, index): ParsedScheduleEmployee => {
    const previous = anchors[index - 1];
    const next = anchors[index + 1];
    const top = previous ? (previous.y + anchor.y) / 2 : anchor.y + 13;
    const bottom = next ? (next.y + anchor.y) / 2 : anchor.y - 13;
    const name = combineColumn(items, 690, 806, top, bottom)
      .replace(/^\d+\s+/, "")
      .replace(/\s+\d+$/, "");
    const teamCode = combineColumn(items, 640, 665, top, bottom).replace(/\s/g, "");
    const mobile = combineColumn(items, 580, 640, top, bottom).replace(/\D/g, "");
    const jobNature = combineColumn(items, 535, 580, top, bottom);

    return {
      fullName: cleanArabic(name),
      employeeCode: anchor.decoded,
      teamCode: cleanArabic(teamCode),
      mobile,
      jobNature: cleanArabic(jobNature),
    };
  });
}

export function parseEmployeeSchedule(pages: PdfTextPosition[][]): ParsedEmployeeSchedule {
  const decoded = pages.flat().map((item) => decodePdfText(item.str)).filter(Boolean);
  if (!decoded.some((value) => value.includes("قطاع السلام"))) {
    throw new Error("الملف لا يخص قطاع السلام أو أن تنسيقه غير معتمد");
  }

  const reportYear = Number(decoded.find((value) => /^20\d{2}$/.test(value)) || 0);
  const reportMonthName = Object.keys(monthNumbers).find((month) =>
    decoded.some((value) => value === month || value.includes(`شهر: ${month}`)),
  );
  const reportMonth = reportMonthName ? monthNumbers[reportMonthName] : 0;
  if (!reportYear || !reportMonth) {
    throw new Error("تعذر قراءة شهر وسنة الجدول");
  }

  const employees = pages.flatMap(parsePageEmployees);
  if (employees.length < 10) {
    throw new Error("لم يتم التعرف على جدول الموظفين؛ تأكد من استخدام نفس تنسيق الملف المعتمد");
  }
  const invalid = employees.filter(
    (employee) =>
      !employee.fullName ||
      !employee.employeeCode ||
      !employee.mobile ||
      !employee.jobNature,
  );
  if (invalid.length) {
    throw new Error(`تعذر قراءة ${invalid.length} من سجلات الموظفين بشكل كامل`);
  }

  return { reportYear, reportMonth, reportMonthName, employees };
}
