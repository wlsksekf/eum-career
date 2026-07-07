package com.hirepicker.config.redis;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import redis.embedded.RedisServer;

import java.io.IOException;

/**
 * 로컬 개발 환경(local 프로필)에서 Redis 설치 없이 구동할 수 있도록 Embedded Redis를 활성화합니다.
 */
@Slf4j
@Profile("local")
@Configuration
public class EmbeddedRedisConfig {

    @Value("${spring.data.redis.port:6379}")
    private int redisPort;

    private RedisServer redisServer;

    @PostConstruct
    public void startRedis() throws IOException {
        log.info("로컬 인메모리 Embedded Redis 서버 기동 시작 (Port: {})", redisPort);
        // 포트 충돌 및 재시작 시 예외 처리를 수행하여 기동 안정성 확보
        try {
            redisServer = new RedisServer(redisPort);
            redisServer.start();
            log.info("Embedded Redis 서버 기동 완료");
        } catch (Exception e) {
            log.error("Embedded Redis 기동 중 오류가 발생했으나 무시합니다 (이미 해당 포트의 Redis가 기동 중일 수 있음): {}", e.getMessage());
        }
    }

    @PreDestroy
    public void stopRedis() {
        if (redisServer != null) {
            redisServer.stop();
            log.info("Embedded Redis 서버 정지 완료");
        }
    }
}
