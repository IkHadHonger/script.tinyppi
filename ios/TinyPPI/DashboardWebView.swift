import SwiftUI
import UIKit
import WebKit

struct DashboardWebView: UIViewRepresentable {
    let baseURL: URL
    let token: String
    let selectedTab: String

    func makeCoordinator() -> Coordinator { Coordinator(selectedTab: selectedTab) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true

        let quotedToken = (try? String(data: JSONEncoder().encode(token), encoding: .utf8)) ?? "\"\""
        let tokenScript = "localStorage.setItem('tinyppi.token', \(quotedToken));"
        configuration.userContentController.addUserScript(
            WKUserScript(source: tokenScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        load(webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.selectedTab = selectedTab
        if webView.url?.host != baseURL.host || webView.url?.port != baseURL.port {
            load(webView)
        } else {
            context.coordinator.selectTab(in: webView)
        }
    }

    private func load(_ webView: WKWebView) {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        components?.path = "/"
        components?.queryItems = [URLQueryItem(name: "embedded", value: "1")]
        components?.fragment = selectedTab
        guard let url = components?.url else { return }
        webView.load(URLRequest(url: url, cachePolicy: .reloadRevalidatingCacheData, timeoutInterval: 15))
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var selectedTab: String

        init(selectedTab: String) {
            self.selectedTab = selectedTab
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            selectTab(in: webView)
        }

        func selectTab(in webView: WKWebView) {
            let safeTab = selectedTab.replacingOccurrences(of: "'", with: "")
            let script = """
            (() => {
              document.getElementById('tabBar')?.classList.add('hidden');
              document.getElementById('tabbtn-\(safeTab)')?.click();
              window.scrollTo(0, 0);
            })();
            """
            webView.evaluateJavaScript(script)
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
