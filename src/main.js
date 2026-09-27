// Componentes Fluent usados, um import por arquivo. Todo fluent-* precisa do
// seu import: o base.css esconde o que não foi definido (:not(:defined)).
import '@fluentui/web-components/switch.js';
import '@fluentui/web-components/radio.js';
import '@fluentui/web-components/radio-group.js';
import { setTheme } from '@fluentui/web-components/theme/set-theme.js';
import { webDarkTheme } from '@fluentui/tokens';
setTheme(webDarkTheme);   // provisório: sai no M11
