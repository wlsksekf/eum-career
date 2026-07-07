package com.hirepicker.controller;

import com.hirepicker.config.RateLimitConfig;
import com.hirepicker.dto.CompanySignupRequestDto;
import com.hirepicker.dto.LoginRequest;
import com.hirepicker.dto.SignupRequestDto; // ★ 새로 만든 DTO 임포트
import com.hirepicker.service.AuthService;
import com.hirepicker.service.CreditService;
import com.hirepicker.service.EmailService; // ★ EmailService 임포트
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse; // HttpOnly 쿠키 설정을 위한 Import
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@Tag(name = "인증", description = "사용자 인증 및 토큰 관련 API")
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private final AuthService authService;
    private final EmailService emailService; // ★ EmailService 주입
    private final RateLimitConfig rateLimitConfig; // Rate Limiting

    /**
     * [신규] 회원가입을 위한 이메일 인증 코드 발송
     */
    @Operation(summary = "이메일 인증 코드 발송", description = "회원가입을 위해 이메일로 인증 코드를 발송합니다.")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "인증 코드가 발송되었습니다."),
        @ApiResponse(responseCode = "400", description = "이메일을 입력해주세요."),
        @ApiResponse(responseCode = "409", description = "이미 가입된 이메일입니다."),
        @ApiResponse(responseCode = "500", description = "이메일 발송 중 오류 발생")
    })
    @PostMapping("/send-verification")
    public ResponseEntity<String> sendVerificationCode(@Parameter(description = "인증받을 이메일", required = true) @RequestBody Map<String, String> payload) {
        String email = payload.get("email");
        log.info("[API] /api/auth/send-verification 요청 수신. 이메일: {}", email);
        if (email == null || email.trim().isEmpty()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("이메일을 입력해주세요.");
        }

        // (개선) 이미 가입된 이메일인지 AuthService에서 확인
        if (authService.isEmailDuplicate(email)) { // authService에 isEmailDuplicate 메서드 구현 필요
             log.warn("이미 가입된 이메일입니다: {}", email);
             return ResponseEntity.status(HttpStatus.CONFLICT).body("이미 가입된 이메일입니다.");
        }

        try {
            emailService.sendVerificationCode(email);
            log.info("인증 코드가 성공적으로 발송되었습니다. 이메일: {}", email);
            return ResponseEntity.ok("인증 코드가 발송되었습니다.");
        } catch (Exception e) {
            log.error("이메일 발송 중 오류 발생. 이메일: {}", email, e);
            // EmailService에서 던진 RuntimeException 처리
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(e.getMessage());
        }
    }

    /**
     * [신규] 이메일 인증 코드 확인
     */
    @Operation(summary = "이메일 인증 코드 확인", description = "입력된 인증 코드가 유효한지 확인하고 '인증 완료' 상태로 변경합니다.")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "이메일이 성공적으로 인증되었습니다."),
        @ApiResponse(responseCode = "400", description = "인증 코드가 유효하지 않거나 만료되었습니다.")
    })
    @PostMapping("/check-verification")
    public ResponseEntity<String> checkVerificationCode(@Parameter(description = "인증받을 이메일과 인증 코드", required = true) @RequestBody Map<String, String> payload) {
        String email = payload.get("email");
        String code = payload.get("verificationCode");
        log.info("[API] /api/auth/check-verification 요청 수신. 이메일: {}", email);

        // [수정] verifyCodeAndSetStatus 호출
        boolean isVerified = emailService.verifyCodeAndSetStatus(email, code);

        if (isVerified) {
            return ResponseEntity.ok("이메일이 성공적으로 인증되었습니다.");
        } else {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("인증 코드가 유효하지 않거나 만료되었습니다.");
        }
    }

    /**
     * [수정] 개인 회원 회원가입 처리 ('인증 완료' 상태 검증)
     */
    @Operation(summary = "개인 회원가입", description = "'인증 완료' 상태 확인 후 개인 회원으로 가입합니다.")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "201", description = "개인 회원가입 성공"),
        @ApiResponse(responseCode = "400", description = "이메일 인증이 완료되지 않았거나 만료되었습니다."),
        @ApiResponse(responseCode = "409", description = "이미 가입된 이메일 또는 사용 중인 닉네임입니다."),
        @ApiResponse(responseCode = "500", description = "회원가입 중 오류가 발생했습니다.")
    })
    @PostMapping("/signup/personal")
    public ResponseEntity<Map<String, Object>> registerPersonalUser(@Valid @RequestBody SignupRequestDto signupRequest, HttpServletResponse response) {
        log.info("[API] /api/auth/signup/personal 요청 수신. 사용자: {}", signupRequest.getEmail());

        // 1. (★수정) '인증 완료' 상태 검증
        boolean isVerified = emailService.isEmailVerified(signupRequest.getEmail());

        if (!isVerified) {
            log.warn("'인증 완료' 상태가 아닙니다. 이메일: {}", signupRequest.getEmail());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", "이메일 인증이 완료되지 않았거나 만료되었습니다."));
        }

        // 2. (검증 통과) 기존 회원가입 로직 수행
        try {
            boolean bonusGranted = authService.registerPersonalUser(signupRequest, response);
            log.info("개인 회원가입 성공. 사용자: {}", signupRequest.getEmail());
            // 3. 성공 응답 (보너스 지급 안내 포함)
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(Map.of(
                            "message", "회원가입이 완료되었습니다.",
                            "signupBonusGranted", bonusGranted,
                            "bonusAmount", CreditService.SIGNUP_BONUS_AMOUNT
                    ));

        } catch (IllegalArgumentException e) {
             log.warn("회원가입 중 충돌 발생: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", e.getMessage()));
        } catch (Exception e) {
            log.error("회원가입 처리 중 알 수 없는 오류 발생. 사용자: {}", signupRequest.getEmail(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "회원가입 중 오류가 발생했습니다."));
        }
    }

    /**
     * [신규] 기업 회원 회원가입 처리
     */
    @Operation(summary = "기업 회원가입", description = "이메일 인증 후 기업 회원으로 가입합니다.")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "201", description = "기업 회원가입 성공"),
        @ApiResponse(responseCode = "400", description = "이메일 인증이 완료되지 않았거나 만료되었습니다."),
        @ApiResponse(responseCode = "409", description = "이미 사용중인 아이디 또는 이메일입니다."),
        @ApiResponse(responseCode = "500", description = "회원가입 중 오류가 발생했습니다.")
    })
    @PostMapping("/signup/company")
    public ResponseEntity<Map<String, String>> registerCompanyUser(
            @Parameter(description = "회원가입 정보 (JSON)", required = true)
            @Valid @RequestPart("signupData") CompanySignupRequestDto signupRequest,
            @Parameter(description = "인증 파일 (사업자등록증 등, PDF/JPG/PNG, 최대 10MB)", required = true)
            @RequestPart("verificationFile") MultipartFile file,
            HttpServletResponse response
    ) {
        log.info("[API] /api/auth/signup/company 요청 수신. 사용자 ID: {}, 파일명: {}",
                signupRequest.getId(), file.getOriginalFilename());

        // === STEP 1: 이메일 인증 상태 검증 ===
        boolean isVerified = emailService.isEmailVerified(signupRequest.getEmail());
        if (!isVerified) {
            log.warn("'인증 완료' 상태가 아닙니다. 이메일: {}", signupRequest.getEmail());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", "이메일 인증이 완료되지 않았거나 만료되었습니다."));
        }

        try {
            // === STEP 2: 파일 검증 및 회원가입 처리 ===
            authService.registerCompanyUserWithDocument(signupRequest, file, response);

            log.info("기업 회원가입 신청 완료. 사용자 ID: {}", signupRequest.getId());

            // === STEP 3: 성공 응답 ===
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(Map.of("message", "회원가입 신청이 완료되었습니다. 관리자 승인 후 로그인 가능합니다."));

        } catch (IllegalArgumentException e) {
            log.warn("회원가입 중 검증 실패: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", e.getMessage()));

        } catch (Exception e) {
            log.error("회원가입 처리 중 알 수 없는 오류 발생. 사용자 ID: {}", signupRequest.getId(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "회원가입 중 오류가 발생했습니다: " + e.getMessage()));
        }
    }

    /**
     * [기존] 로그인 (개인/기업)
     */
    @Operation(summary = "로그인", description = "이메일과 비밀번호를 사용하여 로그인하고 JWT 토큰을 발급받습니다.")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "로그인 성공"),
        @ApiResponse(responseCode = "401", description = "인증 실패"),
        @ApiResponse(responseCode = "500", description = "서버 오류")
    })
    @PostMapping("/login")
    public ResponseEntity<Map<String, String>> login(
            @Valid @RequestBody LoginRequest loginRequest, 
            HttpServletRequest request,
            HttpServletResponse response) {
        
        // Rate Limiting: IP 기반 로그인 시도 제한 (5분에 10회)
        String clientIp = getClientIp(request);
        // [로컬 테스트 편의를 위해 시도 횟수 제한 로직을 주석 처리함]
        /*
        if (!rateLimitConfig.tryConsume(clientIp)) {
            log.warn("[API] 로그인 시도 제한 초과. IP: {}", clientIp);
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("message", "로그인 시도 횟수가 초과되었습니다. 5분 후 다시 시도해주세요."));
        }
        */
        
        log.info("[API] /api/auth/login 요청 수신. IP: {}", clientIp);
        try {
            authService.login(loginRequest, response);
            return ResponseEntity.ok().build();
        } catch (IllegalStateException e) {
            // 기업회원 승인 대기/거부 등 상태 관련 에러
            log.warn("[API] 로그인 거부: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", e.getMessage()));
        } catch (Exception e) {
            // 일반 인증 실패 (아이디/비밀번호 오류)
            log.warn("[API] 로그인 실패: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "아이디 또는 비밀번호가 올바르지 않습니다."));
        }
    }
    
    /**
     * 클라이언트 IP 주소 추출 (프록시 고려)
     */
    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("Proxy-Client-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("WL-Proxy-Client-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("HTTP_CLIENT_IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("HTTP_X_FORWARDED_FOR");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        return ip;
    }

    @Operation(summary = "로그아웃", description = "사용자 세션을 종료하고 JWT 토큰 쿠키를 삭제합니다.")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "로그아웃 성공")
    })
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletResponse response) {
        log.info("[API] /api/auth/logout 요청 수신");
        authService.logout(response);
        return ResponseEntity.ok().build();
    }

    @Operation(summary = "토큰 갱신", description = "리프레시 토큰을 사용하여 새로운 액세스 토큰을 발급받습니다.")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "토큰 갱신 성공"),
        @ApiResponse(responseCode = "401", description = "토큰 갱신 실패")
    })
    @PostMapping("/refresh")
    public ResponseEntity<Void> refreshToken(jakarta.servlet.http.HttpServletRequest request, HttpServletResponse response) {
        log.info("[API] /api/auth/refresh 요청 수신");
        try {
            authService.refreshToken(request, response);
            log.info("토큰 갱신 성공");
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            log.error("토큰 갱신 실패: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
    }
}
