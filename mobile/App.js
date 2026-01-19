import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, SafeAreaView, TouchableOpacity, Text, Platform, BackHandler, ActivityIndicator, Linking, useColorScheme } from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

// Configuration
// -----------------------------------------------------------------------------
// ⚠️ IMPORTANT: Update this URL for Production!
// For local development (Android Emulator), use 'http://10.0.2.2:5173'
// For production, replace with your actual deployed URL (e.g., 'https://app.cryptopayroll.com')
// -----------------------------------------------------------------------------
// mobile/App.js
const PRODUCTION_URL = 'https://your-deployed-app.com'; 
const IS_PRODUCTION = true; // Set to true

const WEB_APP_URL = IS_PRODUCTION ? PRODUCTION_URL : LOCAL_URL; 


const INJECTED_JAVASCRIPT = `
  (function() {
    const style = document.createElement('style');
    style.innerHTML = \`
      aside { display: none !important; }
      main { margin-left: 0 !important; }
      /* Hide mobile header trigger if present */
      button[aria-label="Toggle Sidebar"] { display: none !important; }
    \`;
    document.head.appendChild(style);
  })();
  true;
`;

const TABS = [
  { name: 'Dashboard', icon: 'grid', path: '/dashboard' },
  { name: 'Exchange', icon: 'repeat', path: '/withdraw' }, // Mapped to Exchange/Withdraw page
  { name: 'Transactions', icon: 'file-text', path: '/transactions' },
  { name: 'Settings', icon: 'settings', path: '/settings' },
];

function MainScreen() {
  const webViewRef = useRef(null);
  const [currentUrl, setCurrentUrl] = useState(WEB_APP_URL);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isError, setIsError] = useState(false);
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const theme = {
    background: isDark ? '#000' : '#fff',
    text: isDark ? '#fff' : '#000',
    tabBarBorder: isDark ? '#333' : '#eee',
    inactiveTab: isDark ? '#666' : '#999',
  };

  // Handle Android hardware back button
  useEffect(() => {
    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };

    BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
  }, [canGoBack]);

  // Load last visited URL from SecureStore on startup (optional enhancement)
  useEffect(() => {
    const loadLastUrl = async () => {
      try {
        const url = await SecureStore.getItemAsync('last_url');
        if (url && url.startsWith(WEB_APP_URL)) {
          // Optional: Restore state
          // setCurrentUrl(url); 
        }
      } catch (e) {
        console.log('Failed to load last url', e);
      }
    };
    loadLastUrl();
  }, []);

  // Deep Linking Support
  useEffect(() => {
    const handleDeepLink = (event) => {
      const url = event.url;
      if (url && url.startsWith('cryptopayroll://')) {
        // Extract path from cryptopayroll://path
        const path = url.replace('cryptopayroll://', '');
        // Normalize path
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        navigateTo(cleanPath);
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleNavigationStateChange = (navState) => {
    setCanGoBack(navState.canGoBack);
    setCurrentUrl(navState.url);
    
    // Save current URL to SecureStore
    SecureStore.setItemAsync('last_url', navState.url).catch(() => {});
  };

  const handleShouldStartLoadWithRequest = (request) => {
    // Open external links in system browser
    if (request.url.startsWith('http') && !request.url.startsWith(WEB_APP_URL)) {
      Linking.openURL(request.url);
      return false;
    }
    return true;
  };

  const navigateTo = (path) => {
    const targetUrl = `${WEB_APP_URL}${path}`;
    const script = `window.location.href = '${targetUrl}';`;
    webViewRef.current?.injectJavaScript(script);
  };

  const isTabActive = (path) => {
    return currentUrl.includes(path);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar style="auto" />
      
      <View style={[styles.webViewContainer, { paddingTop: insets.top, backgroundColor: theme.background }]}>
        <WebView
          ref={webViewRef}
          source={{ uri: WEB_APP_URL }}
          style={[styles.webView, { backgroundColor: theme.background }]}
          injectedJavaScript={INJECTED_JAVASCRIPT}
          onNavigationStateChange={handleNavigationStateChange}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn('WebView error: ', nativeEvent);
            setIsError(true);
          }}
          pullToRefreshEnabled={true}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
              <ActivityIndicator size="large" color={theme.text} />
            </View>
          )}
          // Ensure cookies are shared
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
        />
        {isError && (
          <View style={[styles.errorContainer, { backgroundColor: theme.background }]}>
            <Feather name="wifi-off" size={48} color={theme.text} />
            <Text style={[styles.errorText, { color: theme.text }]}>Connection Error</Text>
            <Text style={[styles.errorSubText, { color: theme.inactiveTab }]}>
              Unable to connect to server. Please check your internet connection.
            </Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: theme.text }]}
              onPress={() => {
                setIsError(false);
                webViewRef.current?.reload();
              }}
            >
              <Text style={[styles.retryButtonText, { color: theme.background }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={[
        styles.tabBar, 
        { 
          paddingBottom: Math.max(insets.bottom, 10),
          backgroundColor: theme.background,
          borderTopColor: theme.tabBarBorder 
        }
      ]}>
        {TABS.map((tab) => {
          const active = isTabActive(tab.path);
          return (
            <TouchableOpacity
              key={tab.name}
              style={styles.tabItem}
              onPress={() => navigateTo(tab.path)}
            >
              <Feather
                name={tab.icon}
                size={24}
                color={active ? theme.text : theme.inactiveTab}
              />
              <Text style={[styles.tabLabel, { color: active ? theme.text : theme.inactiveTab }]}>
                {tab.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainScreen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
  },
  errorSubText: {
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
    marginBottom: 30,
  },
  retryButton: {
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 10,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 4,
    fontWeight: '500',
  },
});

