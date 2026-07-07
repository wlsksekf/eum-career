package com.hirepicker.service;

import com.sendgrid.Method;
import com.sendgrid.Request;
import com.sendgrid.Response;
import com.sendgrid.SendGrid;
import com.sendgrid.helpers.mail.Mail;
import com.sendgrid.helpers.mail.objects.Content;
import com.sendgrid.helpers.mail.objects.Email;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.security.SecureRandom;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    @Value("${sendgrid.api-key}")
    private String sendGridApiKey;

    @Value("${spring.profiles.active:local}")
    private String activeProfile;

    // ★ 중요: 이메일 발신자 주소. SendGrid에 'Sender'로 등록/인증된 이메일이어야 함.
    private static final String FROM_EMAIL = "jinaniyagi@gmail.com";
    private static final String VERIFICATION_CODE_PREFIX = "verify:";
    private static final String VERIFIED_STATUS_PREFIX = "verified:"; // ★ 신규: 인증 완료 상태 Prefix
    private static final long CODE_EXPIRATION_MINUTES = 5; // 5분
    private static final long STATUS_EXPIRATION_MINUTES = 10; // ★ 신규: 인증 완료 상태 10분 유지

    // RedisConfig.java에 이미 빈으로 등록된 StringRedisTemplate 주입
    private final StringRedisTemplate redisTemplate;

    /**
     * 인증 코드를 생성하여 Redis에 저장하고, SendGrid를 통해 이메일 발송 (로컬 환경 시 로그만 노출)
     *
     * @param toEmail 인증 코드를 받을 이메일 주소
     */
    public void sendVerificationCode(String toEmail) {
        // 1. 6자리 인증 코드 생성
        String code = createVerificationCode();
        String redisKey = VERIFICATION_CODE_PREFIX + toEmail;

        // 2. Redis에 저장 (5분 유효)
        redisTemplate.opsForValue().set(redisKey, code, CODE_EXPIRATION_MINUTES, TimeUnit.MINUTES);
        log.info("인증 코드 Redis 저장 완료. Key: {}, Expiry: {} 분", redisKey, CODE_EXPIRATION_MINUTES);

        // 3. 로컬 테스트 및 API Key가 무효한 경우 이메일 발송 스킵 후 로그 표시
        if ("local".equals(activeProfile) || "mock_sendgrid_key".equals(sendGridApiKey)) {
            log.info("[로컬 모드] 이메일 인증 코드가 발송된 것으로 모킹 처리되었습니다.");
            log.info("[로컬 모드] 회원가입 이메일: {}, 생성된 인증 코드: [ {} ]", toEmail, code);
            return;
        }

        // 4. SendGrid를 사용한 이메일 발송
        Email from = new Email(FROM_EMAIL);
        String subject = "[HirePicker] 회원가입 인증 코드입니다.";
        Email to = new Email(toEmail);
        Content content = new Content("text/plain", "HirePicker 회원가입을 위한 인증 코드입니다.\n\n인증 코드: " + code + "\n\n5분 이내에 입력해주세요.");
        Mail mail = new Mail(from, subject, to, content);

        SendGrid sg = new SendGrid(sendGridApiKey);
        Request request = new Request();
        try {
            request.setMethod(Method.POST);
            request.setEndpoint("mail/send");
            request.setBody(mail.build());
            Response response = sg.api(request);
            
            log.info("SendGrid 이메일 발송 요청. To: {}, Status Code: {}", toEmail, response.getStatusCode());
            if (response.getStatusCode() >= 400) {
                log.error("SendGrid 발송 실패: {}", response.getBody());
                throw new RuntimeException("이메일 발송에 실패했습니다. SendGrid 응답: " + response.getBody());
            }
        } catch (IOException ex) {
            log.error("SendGrid API 호출 중 IOException 발생", ex);
            throw new RuntimeException("이메일 발송 중 시스템 오류가 발생했습니다.");
        }
    }

    /**
     * [수정] 유저가 입력한 인증 코드를 검증하고, 성공 시 '인증 완료' 상태를 저장
     *
     * @param email 검증할 이메일
     * @param code  유저가 입력한 6자리 코드
     * @return 검증 성공 여부
     */
    public boolean verifyCodeAndSetStatus(String email, String code) {
        String redisKey = VERIFICATION_CODE_PREFIX + email;
        String storedCode = redisTemplate.opsForValue().get(redisKey);

        if (storedCode == null) {
            log.warn("인증 코드 확인 실패: 만료되었거나 존재하지 않는 키. Key: {}", redisKey);
            return false;
        }

        if (storedCode.equals(code)) {
            log.info("인증 코드 확인 성공. Key: {}", redisKey);
            redisTemplate.delete(redisKey); // 1회용 코드 삭제

            // '인증 완료' 상태를 10분간 저장
            String statusKey = VERIFIED_STATUS_PREFIX + email;
            redisTemplate.opsForValue().set(statusKey, "true", STATUS_EXPIRATION_MINUTES, TimeUnit.MINUTES);
            log.info("'인증 완료' 상태 저장. Key: {}, Expiry: {} 분", statusKey, STATUS_EXPIRATION_MINUTES);
            return true;
        }

        log.warn("인증 코드 확인 실패: 코드가 일치하지 않음. Key: {}", redisKey);
        return false;
    }
    
    /**
     * [신규] 해당 이메일이 '인증 완료' 상태인지 확인 (1회용)
     *
     * @param email 확인할 이메일
     * @return 인증 완료 상태 여부
     */
    public boolean isEmailVerified(String email) {
        String statusKey = VERIFIED_STATUS_PREFIX + email;
        Boolean isVerified = redisTemplate.hasKey(statusKey);

        if (isVerified != null && isVerified) {
            log.info("'인증 완료' 상태 확인 성공. Key: {}", statusKey);
            redisTemplate.delete(statusKey); // 확인 후 즉시 삭제 (회원가입에 1번만 사용)
            return true;
        }
        
        log.warn("'인증 완료' 상태 확인 실패. Key: {}", statusKey);
        return false;
    }

    /**
     * 6자리 숫자 난수 생성 (100000 ~ 999999)
     */
    private String createVerificationCode() {
        SecureRandom random = new SecureRandom();
        int code = 100000 + random.nextInt(900000);
        return String.valueOf(code);
    }
}
