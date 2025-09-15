"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
var express_1 = require("express");
var pino_1 = require("pino");
var twilio_1 = require("twilio");
var conversational_agent_1 = require("@wa-agent/conversational-agent");
var sqlite_1 = require("@persistence/sqlite");
var log = (0, pino_1.default)({ name: 'whatsapp-gateway' });
var app = (0, express_1.default)();
app.use(express_1.default.urlencoded({ extended: false }));
// Init session db for provider/model overrides
(0, sqlite_1.init)(process.env.SQLITE_DB_PATH || 'data/sessions.db');
var shouldValidate = process.env.NODE_ENV !== 'test';
var twilioWebhookMw = twilio_1.default.webhook({ validate: shouldValidate });
var accountSid = process.env.TWILIO_ACCOUNT_SID;
var authToken = process.env.TWILIO_AUTH_TOKEN;
var fromWhatsApp = process.env.TWILIO_WHATSAPP_FROM;
if (!accountSid || !authToken || !fromWhatsApp)
    throw new Error('Missing Twilio env vars');
var client = (0, twilio_1.default)(accountSid, authToken);
function readRunnerConfig(forSession) {
    var pref = (0, sqlite_1.getSessionProvider)(forSession);
    var effectiveProvider = (pref.provider || process.env.MODEL_PROVIDER || 'openai').toLowerCase();
    var effectiveModel = pref.model_id || undefined;
    // Collect MCP servers from env: MCP_<NAME>_URL and optional MCP_<NAME>_BEARER
    var mcpServers = {};
    for (var _i = 0, _a = Object.entries(process.env); _i < _a.length; _i++) {
        var _b = _a[_i], k = _b[0], v = _b[1];
        if (k.startsWith('MCP_') && k.endsWith('_URL') && v) {
            var name_1 = k.slice(4, -4).toLowerCase(); // strip MCP_ and _URL
            var bearer = process.env["MCP_".concat(name_1.toUpperCase(), "_BEARER")];
            mcpServers[name_1] = { url: v, bearer: bearer || undefined };
        }
    }
    return {
        provider: effectiveProvider,
        modelId: effectiveModel,
        pgUrl: process.env.DATABASE_URL || 'postgres://localhost:5432/wa_agent',
        workingScope: process.env.WORKING_MEMORY_SCOPE || 'resource',
        lastMessages: Number(process.env.LAST_MESSAGES || 16),
        recallTopK: Number(process.env.SEMANTIC_RECALL_TOPK || 4),
        recallRange: Number(process.env.SEMANTIC_RECALL_RANGE || 2),
        mcpServers: mcpServers,
    };
}
app.post('/twilio/whatsapp/inbound', twilioWebhookMw, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var from, text, t, lower, parts, provider, modelId, _a, _b, reply, err_1, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                from = req.body.From;
                text = req.body.Body || '';
                if (!from || !text) {
                    res.status(204).end();
                    return [2 /*return*/];
                }
                t = (text || '').trim();
                lower = t.toLowerCase();
                if (!lower.startsWith('/provider')) return [3 /*break*/, 5];
                parts = t.split(/\s+/);
                if (!(parts.length >= 2)) return [3 /*break*/, 5];
                provider = parts[1].toLowerCase();
                modelId = parts[2] || null;
                (0, sqlite_1.setSessionProvider)(from, provider, modelId);
                res.status(204).end();
                _d.label = 1;
            case 1:
                _d.trys.push([1, 3, , 4]);
                return [4 /*yield*/, client.messages.create({ from: fromWhatsApp, to: from, body: "Provider set to ".concat(provider).concat(modelId ? ' (' + modelId + ')' : '', ".") })];
            case 2:
                _d.sent();
                return [3 /*break*/, 4];
            case 3:
                _a = _d.sent();
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
            case 5:
                if (!(lower === '/reset')) return [3 /*break*/, 10];
                res.status(204).end();
                _d.label = 6;
            case 6:
                _d.trys.push([6, 8, , 9]);
                return [4 /*yield*/, client.messages.create({ from: fromWhatsApp, to: from, body: 'Session reset.' })];
            case 7:
                _d.sent();
                return [3 /*break*/, 9];
            case 8:
                _b = _d.sent();
                return [3 /*break*/, 9];
            case 9: return [2 /*return*/];
            case 10:
                res.status(204).end(); // ACK
                _d.label = 11;
            case 11:
                _d.trys.push([11, 14, , 19]);
                return [4 /*yield*/, (0, conversational_agent_1.runConversation)(readRunnerConfig(from), text, from)];
            case 12:
                reply = _d.sent();
                return [4 /*yield*/, client.messages.create({ from: fromWhatsApp, to: from, body: reply })];
            case 13:
                _d.sent();
                return [3 /*break*/, 19];
            case 14:
                err_1 = _d.sent();
                log.error({ err: err_1 }, 'Agent error');
                _d.label = 15;
            case 15:
                _d.trys.push([15, 17, , 18]);
                return [4 /*yield*/, client.messages.create({ from: fromWhatsApp, to: from, body: 'Sorry — something went wrong.' })];
            case 16:
                _d.sent();
                return [3 /*break*/, 18];
            case 17:
                _c = _d.sent();
                return [3 /*break*/, 18];
            case 18: return [3 /*break*/, 19];
            case 19: return [2 /*return*/];
        }
    });
}); });
var port = Number(process.env.PORT || 3000);
app.listen(port, function () { return log.info({ port: port }, 'WhatsApp gateway listening'); });
