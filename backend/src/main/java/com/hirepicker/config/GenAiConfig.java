package com.hirepicker.config;

import com.google.genai.Client;
import okhttp3.OkHttpClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Google GenAI 클라이언트를 스프링 빈으로 등록하는 설정 클래스
 */
@Configuration
public class GenAiConfig {

    @Value("${GOOGLE_API_KEY}")
    private String googleApiKey;

    @Bean
    public Client genaiClient() {
        // 1. 기본 빌더로 Client 생성
        Client client = Client.builder()
                .apiKey(googleApiKey)
                .build();

        // 2. 자바 리플렉션을 사용해 ApiClient 내부의 httpClient 필드를 강제로 우회 설정된 OkHttpClient로 교체
        try {
            java.lang.reflect.Field apiClientField = Client.class.getDeclaredField("apiClient");
            apiClientField.setAccessible(true);
            Object apiClient = apiClientField.get(client);

            if (apiClient != null) {
                Class<?> apiClientClass = Class.forName("com.google.genai.ApiClient");
                java.lang.reflect.Field httpClientField = apiClientClass.getDeclaredField("httpClient");
                httpClientField.setAccessible(true);

                // SSL 검증을 우회한 커스텀 OkHttpClient 주입
                OkHttpClient unsafeHttpClient = getUnsafeOkHttpClient();
                httpClientField.set(apiClient, unsafeHttpClient);
            }
        } catch (Exception e) {
            System.err.println("[오류] GenAI Client SSL 우회 주입 실패: " + e.getMessage());
        }

        return client;
    }

    /**
     * 로컬 환경용 SSL 검증 우회 OkHttpClient 빌더
     */
    private OkHttpClient getUnsafeOkHttpClient() {
        try {
            final javax.net.ssl.TrustManager[] trustAllCerts = new javax.net.ssl.TrustManager[]{
                new javax.net.ssl.X509TrustManager() {
                    @Override
                    public void checkClientTrusted(java.security.cert.X509Certificate[] chain, String authType) {}

                    @Override
                    public void checkServerTrusted(java.security.cert.X509Certificate[] chain, String authType) {}

                    @Override
                    public java.security.cert.X509Certificate[] getAcceptedIssuers() {
                        return new java.security.cert.X509Certificate[]{};
                    }
                }
            };

            final javax.net.ssl.SSLContext sslContext = javax.net.ssl.SSLContext.getInstance("SSL");
            sslContext.init(null, trustAllCerts, new java.security.SecureRandom());
            
            final javax.net.ssl.SSLSocketFactory sslSocketFactory = sslContext.getSocketFactory();

            OkHttpClient.Builder builder = new OkHttpClient.Builder();
            builder.sslSocketFactory(sslSocketFactory, (javax.net.ssl.X509TrustManager) trustAllCerts[0]);
            builder.hostnameVerifier((hostname, session) -> true);
            
            // 타임아웃 설정을 120초로 대폭 늘려 응답을 기다림
            builder.connectTimeout(java.time.Duration.ofSeconds(120));
            builder.readTimeout(java.time.Duration.ofSeconds(120));
            builder.writeTimeout(java.time.Duration.ofSeconds(120));

            return builder.build();
        } catch (Exception e) {
            throw new RuntimeException("SSL 우회 OkHttpClient 생성 실패", e);
        }
    }
}
