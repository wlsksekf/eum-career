package com.hirepicker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.scheduling.annotation.EnableScheduling;

import io.github.cdimascio.dotenv.Dotenv;

@SpringBootApplication // Spring Boot 애플리케이션임을 선언
@EnableScheduling // 스케줄링 기능 활성화
@EnableJpaAuditing // JPA Auditing 기능 활성화
public class HirepickerApplication {

    public static void main(String[] args) {

        // 시스템 환경 변수에서 SPRING_PROFILES_ACTIVE 값을 읽어옴
        String profile = System.getenv("SPRING_PROFILES_ACTIVE");

        // profile이 "prod"가 아닐 경우에만 (즉, "local"이거나 설정되지 않았을 때)
        // .env 파일을 로드함
        if (profile == null || !profile.equals("prod")) {
            disableSslVerification(); // 로컬 사설 방화벽 SSL 인증 오류 우회
            Dotenv dotenv = Dotenv.configure().directory("../").load(); // .env 파일 로드 (상위 경로)
            dotenv.entries().forEach(entry -> {
                System.setProperty(entry.getKey(), entry.getValue()); // 로드된 값을 시스템 프로퍼티로 주입
            });
        }

        SpringApplication.run(HirepickerApplication.class, args);
    }

    /**
     * 로컬 개발 환경에서 사설 방화벽/보안 프록시 인증서에 의한 SSLHandshakeException 예외를 우회합니다.
     */
    private static void disableSslVerification() {
        try {
            javax.net.ssl.TrustManager[] trustAllCerts = new javax.net.ssl.TrustManager[]{
                new javax.net.ssl.X509TrustManager() {
                    public java.security.cert.X509Certificate[] getAcceptedIssuers() {
                        return null;
                    }
                    public void checkClientTrusted(java.security.cert.X509Certificate[] certs, String authType) {
                    }
                    public void checkServerTrusted(java.security.cert.X509Certificate[] certs, String authType) {
                    }
                }
            };

            javax.net.ssl.SSLContext sc = javax.net.ssl.SSLContext.getInstance("SSL");
            sc.init(null, trustAllCerts, new java.security.SecureRandom());
            javax.net.ssl.SSLContext.setDefault(sc); // JVM 디폴트 SSLContext 변경 (OkHttp 등에 반영)
            javax.net.ssl.HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());

            javax.net.ssl.HostnameVerifier allHostsValid = (hostname, session) -> true;
            javax.net.ssl.HttpsURLConnection.setDefaultHostnameVerifier(allHostsValid);
        } catch (Exception e) {
            // 우회 에러 무시
        }
    }

}
