const RTL_SCRIPT_RE = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/;
const RTL_LETTER_RE = /[\u0621-\u064a\u0660-\u0669\u0670-\u06d3\u06f0-\u06f9\ufb50-\ufdff\ufe70-\ufeff]/;
const LATIN_STRONG_RE = /[A-Za-z]/;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()]+/i;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const FENCED_CODE_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const INLINE_CODE_RE = /`[^`\n]+`/g;
const ARROWS = ['\u2192', '\u2190', '\u27f6', '\u27f5', '\u21d2', '\u21d0', '\u279c', '\u2794', '\u27a4', '\u279e'];
const ARROW_RE = new RegExp('(' + ARROWS.join('|') + ')', 'g');
const ARROW_CHARS_RE = new RegExp('[' + ARROWS.join('') + ']', 'g');

function stripMarkdownCode(text) {
  return String(text || '').replace(FENCED_CODE_RE, ' ').replace(INLINE_CODE_RE, ' ');
}

function stripProtectedInline(text) {
  return stripMarkdownCode(text).replace(URL_RE, ' ').replace(EMAIL_RE, ' ');
}

function containsRtlScript(text) {
  return RTL_SCRIPT_RE.test(String(text || ''));
}

function containsRtlOutsideCode(text) {
  return RTL_SCRIPT_RE.test(stripProtectedInline(text));
}

function isUrlOrEmail(text) {
  const value = String(text || '').trim();
  return !!value && (URL_RE.test(value) || EMAIL_RE.test(value));
}

function isTerminalOrDiff(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  return /^(\$|>|#)\s+\S/.test(value)
    || /^diff --git\b/m.test(value)
    || /^@@\s/m.test(value)
    || /^[+-](?![+-])\S?/m.test(value);
}

function shouldKeepLtrText(text) {
  return isUrlOrEmail(text) || isTerminalOrDiff(text) || looksCodeLikeText(text);
}

function looksCodeLikeText(text) {
  const value = stripProtectedInline(text).trim();
  if (!value) return false;
  if (isUrlOrEmail(value) || isTerminalOrDiff(value)) return true;
  if (/^\s*(?:const|let|var|function|class|import|export|return|if|for|while|switch|try|catch|type|interface|enum|def|from|select|insert|update|delete|create|alter|drop)\b/i.test(value)) return true;
  if (/^\s*(?:\/[^\s]+\/|\.\.?\/|~\/|[A-Za-z]:[\\/])/.test(value)) return true;
  if (/^\s*[\w.-]+\/\S*\.[A-Za-z0-9]{1,8}\b/.test(value)) return true;

  const rtlIndex = value.search(RTL_LETTER_RE);
  const prefix = rtlIndex >= 0 ? value.slice(0, rtlIndex) : value;
  return prefix.includes('=')
    || prefix.includes(';')
    || prefix.includes('(')
    || prefix.includes('[')
    || prefix.includes('{')
    || prefix.includes('"')
    || prefix.includes("'")
    || prefix.includes('`')
    || prefix.includes('<')
    || prefix.includes('>');
}

function strongCounts(text) {
  const counts = { rtl: 0, latin: 0 };
  for (const ch of stripProtectedInline(text)) {
    if (RTL_LETTER_RE.test(ch)) counts.rtl += 1;
    else if (LATIN_STRONG_RE.test(ch)) counts.latin += 1;
  }
  return counts;
}

function isRtlDominantMixedProse(text) {
  const value = stripProtectedInline(text).trim();
  if (!RTL_SCRIPT_RE.test(value)) return false;
  if (looksCodeLikeText(value)) return false;
  const counts = strongCounts(value);
  if (counts.rtl < 2) return false;
  return counts.rtl >= Math.max(2, counts.latin * 0.35);
}

function firstStrongDirection(text) {
  const value = stripProtectedInline(text);
  for (const ch of value) {
    if (RTL_LETTER_RE.test(ch)) return 'rtl';
    if (LATIN_STRONG_RE.test(ch)) {
      return isRtlDominantMixedProse(value) ? 'rtl' : 'ltr';
    }
  }
  return RTL_SCRIPT_RE.test(value) ? 'rtl' : 'ltr';
}

function directionForText(text) {
  if (shouldKeepLtrText(text)) return 'ltr';
  if (!containsRtlOutsideCode(text)) return 'ltr';
  return firstStrongDirection(text);
}

function directionForTableCell(text) {
  return containsRtlOutsideCode(text) ? 'rtl' : 'ltr';
}

function tableDirection(cells) {
  return {
    table: 'ltr',
    cells: cells.map(directionForTableCell),
  };
}

function stripArrows(text) {
  return String(text || '').replace(ARROW_CHARS_RE, '');
}

function immediateToken(text, leftSlice) {
  const stripped = stripArrows(text);
  const match = leftSlice ? stripped.match(/(\S+)\s*$/) : stripped.match(/^\s*(\S+)/);
  return match ? match[1] : '';
}

function tokenKind(token) {
  if (!token) return null;
  if (isUrlOrEmail(token)) return 'protected-ltr';
  return RTL_LETTER_RE.test(token) ? 'prose-rtl' : 'prose-ltr';
}

function shouldMirrorArrow(leftText, rightText) {
  const left = tokenKind(immediateToken(leftText, true));
  const right = tokenKind(immediateToken(rightText, false));
  return left === 'prose-rtl' || right === 'prose-rtl';
}

function arrowMirrorPlan(text) {
  const value = String(text || '');
  const result = [];
  let match;
  ARROW_RE.lastIndex = 0;
  while ((match = ARROW_RE.exec(value))) {
    result.push({
      arrow: match[1],
      index: match.index,
      mirror: shouldMirrorArrow(value.slice(0, match.index), value.slice(match.index + match[1].length)),
    });
  }
  return result;
}

module.exports = {
  ARROWS,
  ARROW_RE,
  containsRtlOutsideCode,
  containsRtlScript,
  directionForTableCell,
  directionForText,
  firstStrongDirection,
  isTerminalOrDiff,
  isUrlOrEmail,
  shouldKeepLtrText,
  shouldMirrorArrow,
  stripMarkdownCode,
  tableDirection,
  arrowMirrorPlan,
};
