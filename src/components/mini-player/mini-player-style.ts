export const miniPlayerStyle = `
.preview-turntable{display:block;width:100%;height:auto;pointer-events:none;user-select:none;filter:drop-shadow(0 8px 10px #0005)}.preview-record{transform-box:view-box}.preview-arm{transform-origin:245px 35px;transform:rotate(-8deg);transition:transform .5s}.preview-arm.on{transform:rotate(45deg)}@media(prefers-reduced-motion:reduce){.preview-arm{transition:none}}
.desktop-player-turntable{width:88%;margin:0 auto}
.transport button{width:48px;height:48px;display:grid;place-items:center;padding:0;border:0;background:transparent}
.transport button.play{width:64px;height:64px;border:0;border-radius:50%;background:var(--accent)}
.transport .skip-symbol{width:19px;height:19px;fill:var(--text)}
.transport .skip-stem,.transport .skip-triangle{fill:var(--text)}
.transport .play-symbol{width:17px;height:22px;margin-left:3px;fill:var(--ink)}
.transport .pause-symbol{width:15px;height:20px;fill:var(--surface)}
*{box-sizing:border-box}html,body{margin:0;min-width:280px;background:#131416;color:#f4f1e9;font:13px system-ui,sans-serif}body{padding:16px}button,input{font:inherit}button{color:inherit;cursor:pointer;border:1px solid #ffffff20;background:#ffffff08;border-radius:9px;padding:8px 11px}button:hover{background:#ffffff16}button:disabled{opacity:.4;cursor:default}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px}button:active{transform:translateY(1px)}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.brand{font-size:10px;font-weight:800;letter-spacing:2px}.brand small{display:block;color:#96999e;font-size:8px;letter-spacing:1.2px;margin-top:4px}.window-actions{display:flex;gap:6px}.window-actions button{padding:5px 9px}.deck{height:190px;position:relative;isolation:isolate;border:1px solid #ffffff18;border-radius:15px;background:linear-gradient(140deg,#343639,#202124 65%);padding:18px;box-shadow:0 12px 26px #0006;overflow:hidden}.deck-label{position:absolute;right:12px;bottom:12px;letter-spacing:2px;font-size:8px;color:#b7b9bc}.record{width:154px;aspect-ratio:1;border-radius:50%;border:1px solid #ffffff24;background:repeating-radial-gradient(circle,#121214 0px,#121214 2px,#252528 3px,#101012 4px);box-shadow:3px 7px 14px #000b;display:grid;place-items:center;position:relative;touch-action:none;cursor:grab;animation:spin 10s linear infinite paused}.record.playing{animation-play-state:running}.record.scrubbing{animation-play-state:paused;cursor:grabbing}.record-label{width:38%;height:38%;border-radius:50%;background:var(--accent);display:grid;place-items:center;overflow:hidden;box-shadow:0 0 0 3px #111}.record-label img{width:100%;height:100%;object-fit:cover;pointer-events:none}.record-label span{color:var(--ink);font-weight:900;font-size:10px;letter-spacing:1px}.spindle{position:absolute;width:8px;height:8px;background:#bcbfc3;border:2px solid #62656a;border-radius:50%;left:calc(50% - 4px);top:calc(50% - 4px)}.arm{position:absolute;right:15%;top:15%;width:8px;height:54%;border-radius:4px;background:linear-gradient(90deg,#666,#ddd,#777);transform-origin:50% 8px;transform:rotate(-12deg);transition:transform .5s;pointer-events:none;box-shadow:3px 3px 5px #0008}.arm.on{transform:rotate(23deg)}.arm:before{content:'';position:absolute;top:-7px;left:-8px;width:24px;height:24px;background:radial-gradient(circle,#b7b7b7,#45474c);border-radius:50%}.arm:after{content:'';position:absolute;bottom:-7px;left:-4px;width:16px;height:28px;background:#151619;border:1px solid #666;border-radius:3px}.song{margin:20px 0 14px}.eyebrow{color:var(--accent);font-size:8px;font-weight:800;letter-spacing:2px}.song h1{font-size:21px;line-height:1.2;letter-spacing:-.5px;margin:6px 0;overflow-wrap:anywhere}.artist{color:#afb0b6;font-size:12px;margin:0}.seek{width:100%;accent-color:var(--accent);margin:0;cursor:pointer;min-height:24px}.times{display:flex;justify-content:space-between;font-size:10px;color:#999da5;font-variant-numeric:tabular-nums}.transport{display:flex;justify-content:center;align-items:center;gap:25px;margin:12px 0 18px}.transport button{width:42px;height:42px;border:0;background:transparent;font-size:20px}.transport .play{width:54px;height:54px;border-radius:50%;background:var(--accent);color:var(--ink);font-size:22px;font-weight:900}.notice{color:#aaaeb7;font-size:11px;line-height:1.5}.error{color:#ffb7b7}.footer{display:flex;justify-content:space-between;margin-top:14px;gap:8px}.footer button{font-size:10px}.settings{border:1px solid #ffffff20;border-radius:10px;padding:12px;margin-top:12px;line-height:1.6}.settings label{display:flex;gap:8px;align-items:center}.settings input{accent-color:var(--accent)}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.record{animation:none}.arm{transition:none}}
.player-feedback{display:contents}
html.responsive-preview,html.responsive-preview body{min-width:0;width:100%;height:100%;padding:0;overflow:hidden}
.responsive-preview main{width:100%;height:100%;overflow:hidden}
.responsive-player{position:relative;transform-origin:top left;padding:12px;display:grid;gap:6px;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto 24px auto auto auto auto;grid-template-areas:"top" "deck" "song" "seek" "times" "transport" "feedback" "footer"}
.responsive-player>*{min-width:0;min-height:0}
.responsive-player .top{grid-area:top;margin:0}
.responsive-player .brand{font-size:9px;letter-spacing:1.3px}
.responsive-player .brand small{font-size:7px;letter-spacing:.8px}
.responsive-player .preview-turntable{grid-area:deck;justify-self:center;width:88%;height:100%;min-height:0;filter:none}
.responsive-player .song{grid-area:song;margin:0}
.responsive-player .song h1{font-size:clamp(16px,4vw,23px);margin:4px 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.responsive-player .artist{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.responsive-player .seek{grid-area:seek;align-self:center}
.responsive-player .times{grid-area:times}
.responsive-player .transport{grid-area:transport;margin:0;gap:30px}
.responsive-player .transport button{width:48px;height:48px;display:grid;place-items:center;padding:0;border:0;background:transparent}
.responsive-player .transport button:hover{background:#ffffff10}
.responsive-player .transport button.play{width:64px;height:64px;border:0;border-radius:50%;background:var(--accent)}
.responsive-player .skip-symbol{width:19px;height:19px;fill:var(--text)}
.responsive-player .skip-stem,.responsive-player .skip-triangle{fill:var(--text)}
.responsive-player .play-symbol{width:17px;height:22px;margin-left:3px;fill:var(--ink)}
.responsive-player .pause-symbol{width:15px;height:20px}
.responsive-player .pause-symbol{fill:var(--surface)}
.responsive-player .transport button{width:42px;height:42px}
.responsive-player .transport .play{width:64px;height:64px}
.responsive-player .player-feedback{grid-area:feedback;display:block}
.responsive-player .player-feedback:empty{display:none}
.responsive-player .player-feedback button{font-size:11px;padding:5px 8px}
.responsive-player .error{margin:0;font-size:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.responsive-player .footer{grid-area:footer;margin:0;align-items:center}
.responsive-player .footer .notice{font-size:9px;text-align:right;max-width:48%}
.responsive-player .footer button{padding:6px 8px;white-space:nowrap}
.responsive-player .settings{position:absolute;inset:48px 12px 12px;background:#202124;z-index:2;margin:0;overflow:auto;box-shadow:0 6px 20px #0008}
.responsive-player.landscape{column-gap:16px;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) 24px auto auto auto auto;grid-template-areas:"top top" "deck song" "deck seek" "deck times" "deck transport" "deck feedback" "deck footer"}
.responsive-player.landscape .song{align-self:center}
.responsive-player.landscape .song h1{font-size:clamp(16px,3vh,23px)}
`;
