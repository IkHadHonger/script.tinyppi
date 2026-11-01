import SwiftUI
import UIKit
import WebKit

struct DashboardWebView: UIViewRepresentable {
    let baseURL: URL
    let token: String
    let selectedTab: String
    var onDetailVisibilityChanged: (Bool) -> Void = { _ in }

    func makeCoordinator() -> Coordinator {
        Coordinator(
            selectedTab: selectedTab,
            onDetailVisibilityChanged: onDetailVisibilityChanged
        )
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.userContentController.add(
            context.coordinator,
            name: Coordinator.detailVisibilityMessage
        )

        let appShellScript = """
        (() => {
          if (window.top !== window) return;
          const install = () => {
            const root = document.documentElement;
            if (!root) return false;
            root.classList.add('tinyppi-ios-app');
            if (!document.getElementById('tinyppi-ios-app-shell')) {
              const style = document.createElement('style');
              style.id = 'tinyppi-ios-app-shell';
              style.textContent = '#tabBar { display: none !important; }';
              root.appendChild(style);
            }
            return true;
          };
          if (!install()) {
            const observer = new MutationObserver(() => {
              if (install()) observer.disconnect();
            });
            observer.observe(document, {childList: true, subtree: true});
          }
        })();
        """
        configuration.userContentController.addUserScript(
            WKUserScript(source: appShellScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )

        let quotedToken = (try? String(data: JSONEncoder().encode(token), encoding: .utf8)) ?? "\"\""
        let tokenScript = "localStorage.setItem('tinyppi.token', \(quotedToken));"
        configuration.userContentController.addUserScript(
            WKUserScript(source: tokenScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        let fanartScript = """
        (() => {
          let lastTag = null;
          const updateFanart = async () => {
            try {
              if (!window.TinyPPI || !window.TinyPPIHeroFanart) return;
              const state = await TinyPPI.getJSON('/api/state');
              const tag = state && state.playing && state.art ? (state.art.fanart || '') : '';
              if (tag === lastTag) return;
              lastTag = tag;
              TinyPPIHeroFanart.show(document.getElementById('nowCard'), tag);
            } catch (_) {}
          };
          updateFanart();
          window.setInterval(updateFanart, 3000);
        })();
        """
        configuration.userContentController.addUserScript(
            WKUserScript(source: fanartScript, injectionTime: .atDocumentEnd, forMainFrameOnly: false)
        )
        let settingsPolishScript = """
        (() => {
          if (window.top !== window) return;
          document.documentElement.classList.add('tinyppi-ios-app');
          const style = document.createElement('style');
          style.textContent = `
            .tinyppi-ios-app #dashboardBoxesCard .sethead { font-size: 19px; padding-top: 18px; }
            .tinyppi-ios-app #dashboardBoxesCard .setbody { gap: 14px; }
            .tinyppi-ios-app #dashboardBoxesCard label { color: var(--muted); line-height: 1.4; }
            .tinyppi-ios-app #dashboardBoxes { min-height: 108px; resize: vertical; border-radius: 14px; padding: 14px; font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
            .tinyppi-ios-app #dashboardBoxesSave { border-radius: 14px; background: var(--accent); color: #101114; font-weight: 700; }
            .tinyppi-ios-app #dashboardBoxTokens { display: grid; gap: 10px; }
            .tinyppi-ios-app .ios-box-card { display: grid; gap: 11px; padding: 14px; border: 1px solid var(--line); border-radius: 16px; background: color-mix(in srgb, var(--bg) 72%, white 3%); }
            .tinyppi-ios-app .ios-box-header { display: flex; align-items: center; gap: 10px; font-weight: 650; }
            .tinyppi-ios-app .ios-box-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; background: var(--tonal); color: var(--on-tonal); font-size: 17px; }
            .tinyppi-ios-app .ios-box-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 8px; }
            .tinyppi-ios-app .ios-box-actions .setbtn { min-height: 40px; border-radius: 11px; padding: 0 12px; font-size: 13px; }
            .tinyppi-ios-app #dashboardBoxesStatus { margin: 2px 0 0; padding: 13px 14px; border-radius: 13px; background: color-mix(in srgb, var(--tonal) 45%, transparent); color: var(--muted); font-size: 13px; line-height: 1.45; }
          `;
          document.head.append(style);

          const polish = () => {
            const card = document.getElementById('dashboardBoxesCard');
            const tokenList = document.getElementById('dashboardBoxTokens');
            if (!card || !tokenList) return;
            const heading = card.querySelector('.sethead');
            if (heading && heading.textContent !== 'Andere TinyPPI-boxen') heading.textContent = 'Andere TinyPPI-boxen';
            const label = card.querySelector('label[for="dashboardBoxes"]');
            if (label && label.textContent !== 'Serveradressen · één per regel') label.textContent = 'Serveradressen · één per regel';
            const save = document.getElementById('dashboardBoxesSave');
            if (save && save.textContent !== 'Boxen bewaren') save.textContent = 'Boxen bewaren';

            for (const button of [...tokenList.querySelectorAll(':scope > button.setbtn')]) {
              const parts = button.textContent.split(' · ');
              const host = parts.shift() || 'TinyPPI-box';
              let action = parts.join(' · ');
              action = action.replace('Token invoeren in dit dashboard', 'Token instellen')
                .replace('Bekijken via deze Cube', 'Via deze Cube bekijken')
                .replace('Koppeltoken aanpassen', 'Koppeltoken wijzigen');
              let group = [...tokenList.querySelectorAll('.ios-box-card')].find((item) => item.dataset.host === host);
              if (!group) {
                group = document.createElement('div');
                group.className = 'ios-box-card';
                group.dataset.host = host;
                const header = document.createElement('div');
                header.className = 'ios-box-header';
                const icon = document.createElement('span');
                icon.className = 'ios-box-icon';
                icon.textContent = '▤';
                const name = document.createElement('span');
                name.textContent = host;
                header.append(icon, name);
                const actions = document.createElement('div');
                actions.className = 'ios-box-actions';
                group.append(header, actions);
                tokenList.append(group);
              }
              button.textContent = action;
              group.querySelector('.ios-box-actions').append(button);
            }
          };
          polish();
          new MutationObserver(polish).observe(document.documentElement, {childList: true, subtree: true});
        })();
        """
        configuration.userContentController.addUserScript(
            WKUserScript(source: settingsPolishScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        )
        let detailVisibilityScript = """
        (() => {
          if (window.top !== window || window.__tinyppiNativeDetailObserver) return;
          window.__tinyppiNativeDetailObserver = true;
          let last = null;
          const report = () => {
            const open = ['detailsDialog', 'seasonsDialog'].some((id) =>
              document.getElementById(id)?.hasAttribute('open'));
            if (open === last) return;
            last = open;
            window.webkit?.messageHandlers?.tinyppiDetailVisibility?.postMessage(open);
          };
          const observe = () => {
            for (const id of ['detailsDialog', 'seasonsDialog']) {
              const dialog = document.getElementById(id);
              if (dialog) new MutationObserver(report).observe(dialog, {attributes: true, attributeFilter: ['open']});
            }
            report();
          };
          document.readyState === 'loading'
            ? document.addEventListener('DOMContentLoaded', observe, {once: true})
            : observe();
        })();
        """
        configuration.userContentController.addUserScript(
            WKUserScript(source: detailVisibilityScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        )
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.alpha = 0
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.selectedTab = selectedTab
        context.coordinator.onDetailVisibilityChanged = onDetailVisibilityChanged
        if !context.coordinator.hasRequestedInitialLoad
            || webView.url?.host != baseURL.host
            || webView.url?.port != baseURL.port {
            context.coordinator.hasRequestedInitialLoad = true
            load(webView)
        } else if webView.url != nil {
            context.coordinator.selectTab(in: webView)
        }
    }

    private func load(_ webView: WKWebView) {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        components?.path = "/"
        components?.queryItems = nil
        components?.fragment = selectedTab
        guard let url = components?.url else { return }
        webView.load(URLRequest(url: url, cachePolicy: .reloadRevalidatingCacheData, timeoutInterval: 15))
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        static let detailVisibilityMessage = "tinyppiDetailVisibility"
        var selectedTab: String
        var onDetailVisibilityChanged: (Bool) -> Void
        var hasRequestedInitialLoad = false
        private var detailIsOpen = false

        init(selectedTab: String, onDetailVisibilityChanged: @escaping (Bool) -> Void) {
            self.selectedTab = selectedTab
            self.onDetailVisibilityChanged = onDetailVisibilityChanged
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == Self.detailVisibilityMessage,
                  let isOpen = message.body as? Bool,
                  isOpen != detailIsOpen else { return }
            detailIsOpen = isOpen
            onDetailVisibilityChanged(isOpen)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            selectTab(in: webView, revealAfterSelection: true)
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            webView.alpha = 0
        }

        func selectTab(in webView: WKWebView, revealAfterSelection: Bool = false) {
            let safeTab = selectedTab.replacingOccurrences(of: "'", with: "")
            let script = """
            (() => {
              const tabBar = document.getElementById('tabBar');
              if (tabBar) {
                tabBar.classList.add('hidden');
                tabBar.style.setProperty('display', 'none', 'important');
              }
              document.getElementById('tabbtn-\(safeTab)')?.click();
              window.scrollTo(0, 0);
            })();
            """
            webView.evaluateJavaScript(script) { _, _ in
                guard revealAfterSelection else { return }
                DispatchQueue.main.async {
                    UIView.animate(withDuration: 0.12) { webView.alpha = 1 }
                }
            }
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
                UIApplication.shared.open(url)
            }
            return nil
        }
    }
}
