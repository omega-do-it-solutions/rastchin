(function () {
  try {
    var RTL_SCRIPT = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/;
    var RTL_LETTER = /[\u0621-\u064a\u0660-\u0669\u0670-\u06d3\u06f0-\u06f9\ufb50-\ufdff\ufe70-\ufeff]/;
    var LATIN_STRONG = /[A-Za-z]/;
    var URL = /\b(?:https?:\/\/|www\.)[^\s<>()]+/i;
    var EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
    var CODE_SEL = 'pre, code, kbd, samp, textarea, input';
    var BLOCK_SEL = 'p, blockquote, h1, h2, h3, h4, h5, h6, summary, dt, dd, figcaption, caption';
    var UNIT_SEL = BLOCK_SEL + ', li, td, th';
    var ARROWS = ['\u2192', '\u2190', '\u27f6', '\u27f5', '\u21d2', '\u21d0', '\u279c', '\u2794', '\u27a4', '\u279e'];
    var ARROW_RE = new RegExp('(' + ARROWS.join('|') + ')', 'g');
    var ARROW_CHARS_RE = new RegExp('[' + ARROWS.join('') + ']', 'g');
    var MIRROR_CLASS = 'bidi-arrow-mirror-clean';
    var MONO_CLASS = 'fa-mono-clean';
    var MAX_ATTEMPTS = 10;
    var flipAttempts = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

    function isProtected(el) {
      return !!(el && el.closest && el.closest(CODE_SEL));
    }

    function textOutsideProtected(el) {
      var out = '';
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
          if (!node.parentElement || isProtected(node.parentElement)) return NodeFilter.FILTER_REJECT;
          if (node.parentElement.classList && node.parentElement.classList.contains(MIRROR_CLASS)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      var node;
      while ((node = walker.nextNode())) out += ' ' + node.nodeValue;
      return out;
    }

    function hasRtl(el) {
      return RTL_SCRIPT.test(textOutsideProtected(el));
    }

    function shouldKeepLtr(text) {
      var value = String(text || '').trim();
      var standaloneUrl = /^(?:https?:\/\/|www\.)[^\s<>()]+$/i.test(value);
      var standaloneEmail = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value);
      return standaloneUrl || standaloneEmail || /^(\$|>|#)\s+\S/.test(value) || /^diff --git\b/m.test(value) || /^@@\s/m.test(value) || /^[+-](?![+-])\S?/m.test(value);
    }

    function looksLikePathOrCommand(text) {
      var value = String(text || '').trim();
      if (!value) return false;
      // Standalone paths should remain LTR even when the filename contains
      // Persian. Prose that merely mentions a path should wrap that path in
      // Markdown code and let the surrounding sentence stay RTL.
      if (!/\s/.test(value) && /(?:^~?\.{0,2}\/|\/|\\|^[A-Za-z]:[\\/])/.test(value)) return true;
      // Keep common command lines LTR, including commands with Persian quoted
      // arguments such as: git commit -m "گزارش".
      if (/^(?:git|npm|pnpm|yarn|node|npx|bun|deno|python3?|pip3?|cargo|go|make|cmake|docker|kubectl|ssh|scp|rsync|curl|wget|brew|code)\b(?:\s|$)/i.test(value)) return true;
      return false;
    }

    function firstStrongDir(text) {
      if (shouldKeepLtr(text)) return 'ltr';
      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (RTL_LETTER.test(ch)) return 'rtl';
        if (LATIN_STRONG.test(ch)) return 'ltr';
      }
      return RTL_SCRIPT.test(text) ? 'rtl' : 'ltr';
    }

    function markdownPreviewTextDir(text) {
      if (shouldKeepLtr(text) || looksLikePathOrCommand(text)) return 'ltr';
      return RTL_SCRIPT.test(text) ? 'rtl' : firstStrongDir(text);
    }

    function stripArrows(text) {
      return String(text || '').replace(ARROW_CHARS_RE, '');
    }

    function immediateToken(text, leftSlice) {
      var stripped = stripArrows(text);
      var match = leftSlice ? stripped.match(/(\S+)\s*$/) : stripped.match(/^\s*(\S+)/);
      return match ? match[1] : '';
    }

    function tokenKind(token) {
      if (!token) return null;
      if (URL.test(token) || EMAIL.test(token)) return 'protected-ltr';
      return RTL_LETTER.test(token) ? 'prose-rtl' : 'prose-ltr';
    }

    function closestUnit(node, root) {
      var parent = node && node.parentElement;
      return (parent && parent.closest && parent.closest(UNIT_SEL)) || root;
    }

    function collectParts(unit) {
      var parts = [];
      function walk(node) {
        if (!node) return;
        if (node.nodeType === 1) {
          if (node.classList && node.classList.contains(MIRROR_CLASS)) return;
          if (node.matches && node.matches(CODE_SEL)) {
            if (/\S/.test(node.textContent || '')) parts.push({ kind: 'code', node: node, text: node.textContent || '' });
            return;
          }
          for (var child = node.firstChild; child; child = child.nextSibling) walk(child);
        } else if (node.nodeType === 3) {
          parts.push({ kind: 'text', node: node, text: node.nodeValue || '' });
        }
      }
      walk(unit);
      return parts;
    }

    function nearest(parts, index, offset, dir) {
      var part = parts[index];
      if (!part) return null;
      if (dir < 0) {
        var left = tokenKind(immediateToken(part.text.slice(0, offset), true));
        if (left) return left;
        for (var i = index - 1; i >= 0; i--) {
          if (parts[i].kind === 'code') return 'code';
          var leftNext = tokenKind(immediateToken(parts[i].text, true));
          if (leftNext) return leftNext;
        }
      } else {
        var right = tokenKind(immediateToken(part.text.slice(offset + 1), false));
        if (right) return right;
        for (var j = index + 1; j < parts.length; j++) {
          if (parts[j].kind === 'code') return 'code';
          var rightNext = tokenKind(immediateToken(parts[j].text, false));
          if (rightNext) return rightNext;
        }
      }
      return null;
    }

    function shouldMirror(node, offset, root) {
      var unit = closestUnit(node, root);
      if (!RTL_SCRIPT.test(textOutsideProtected(unit))) return false;
      var parts = collectParts(unit);
      var index = -1;
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].node === node) {
          index = i;
          break;
        }
      }
      if (index === -1) return false;
      return nearest(parts, index, offset, -1) === 'prose-rtl' || nearest(parts, index, offset, 1) === 'prose-rtl';
    }

    function wrapArrows(root) {
      if (!root || !root.querySelectorAll) return;
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
          if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
          ARROW_RE.lastIndex = 0;
          if (!ARROW_RE.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
          ARROW_RE.lastIndex = 0;
          var parent = node.parentElement;
          if (!parent || isProtected(parent)) return NodeFilter.FILTER_REJECT;
          if (parent.classList && parent.classList.contains(MIRROR_CLASS)) return NodeFilter.FILTER_REJECT;
          if (flipAttempts && (flipAttempts.get(parent) || 0) >= MAX_ATTEMPTS) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      var nodes = [];
      var node;
      while ((node = walker.nextNode())) nodes.push(node);
      nodes.forEach(function (textNode) {
        var text = textNode.nodeValue;
        var parent = textNode.parentElement;
        var fragment = document.createDocumentFragment();
        var changed = false;
        var last = 0;
        var match;
        ARROW_RE.lastIndex = 0;
        while ((match = ARROW_RE.exec(text))) {
          if (match.index > last) fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
          if (shouldMirror(textNode, match.index, root)) {
            var span = document.createElement('span');
            span.className = MIRROR_CLASS;
            span.textContent = match[1];
            fragment.appendChild(span);
            changed = true;
          } else {
            fragment.appendChild(document.createTextNode(match[1]));
          }
          last = match.index + match[1].length;
        }
        if (!changed) return;
        if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)));
        if (flipAttempts && parent) flipAttempts.set(parent, (flipAttempts.get(parent) || 0) + 1);
        if (textNode.parentNode) textNode.parentNode.replaceChild(fragment, textNode);
      });
    }

    function setTextElement(el) {
      if (isProtected(el)) return;
      var text = textOutsideProtected(el);
      var persian = RTL_SCRIPT.test(text);
      var meaningfulText = /\S/.test(text);
      var mono = meaningfulText && (shouldKeepLtr(text) || looksLikePathOrCommand(text));
      el.classList.toggle('fa-text-clean', persian);
      el.classList.toggle(MONO_CLASS, mono);
      var dir = markdownPreviewTextDir(text);
      el.classList.toggle('fa-rtl-clean', persian && dir === 'rtl');
      el.classList.toggle('fa-ltr-clean', meaningfulText && (!persian || dir === 'ltr'));
      if (persian) {
        el.setAttribute('dir', dir);
        wrapArrows(el);
      } else if (meaningfulText) {
        el.setAttribute('dir', 'ltr');
      } else {
        el.removeAttribute('dir');
        el.classList.remove('fa-rtl-clean');
        el.classList.remove('fa-ltr-clean');
        el.classList.remove(MONO_CLASS);
      }
    }

    function applyRtl() {
      document.querySelectorAll(BLOCK_SEL).forEach(setTextElement);
      document.querySelectorAll('ul, ol').forEach(function (list) {
        if (isProtected(list)) return;
        var anyRtl = false;
        list.querySelectorAll('li').forEach(function (li) {
          setTextElement(li);
          if (li.getAttribute('dir') === 'rtl') anyRtl = true;
        });
        list.classList.toggle('fa-rtl-clean', anyRtl);
      });
      document.querySelectorAll('table').forEach(function (table) {
        table.setAttribute('dir', 'ltr');
        table.querySelectorAll('th, td').forEach(function (cell) {
          var text = textOutsideProtected(cell);
          var persian = RTL_SCRIPT.test(text);
          var dir = markdownPreviewTextDir(text);
          cell.classList.toggle('fa-text-clean', persian);
          cell.classList.toggle('fa-rtl-clean', persian && dir === 'rtl');
          cell.classList.toggle('fa-ltr-clean', dir === 'ltr');
          cell.classList.toggle(MONO_CLASS, shouldKeepLtr(text) || looksLikePathOrCommand(text));
          cell.setAttribute('dir', dir);
          if (persian && dir === 'rtl') wrapArrows(cell);
        });
      });
      document.querySelectorAll('a').forEach(function (a) {
        var value = String(a.textContent || '').trim();
        var standaloneUrl = /^(?:https?:\/\/|www\.)[^\s<>()]+$/i.test(value);
        var standaloneEmail = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value);
        a.classList.toggle('fa-ltr-clean', standaloneUrl || standaloneEmail);
        a.classList.toggle(MONO_CLASS, standaloneUrl || standaloneEmail);
      });
    }

    var scheduled = false;
    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () {
        scheduled = false;
        applyRtl();
      });
    }

    applyRtl();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  } catch (error) {
    try { console.error('[persian-rtl-clean markdown-preview]', error); } catch (_) {}
  }
}());
