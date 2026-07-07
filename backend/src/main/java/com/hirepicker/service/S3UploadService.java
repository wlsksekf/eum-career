package com.hirepicker.service;

// S3 파일 업로드를 담당하는 서비스 (AWS SDK v2)

import com.hirepicker.config.S3Config;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import org.springframework.beans.factory.annotation.Value;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Base64;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class S3UploadService {

    @Value("${spring.profiles.active:local}")
    private String activeProfile;

    private final S3Client s3Client; // S3 클라이언트 (v2)
    private final S3Config s3Config; // 버킷명 등의 설정 접근용

    /**
     * 파일을 S3 또는 로컬 디렉터리에 업로드합니다.
     * @param multipartFile 업로드할 파일
     * @param dirName 업로드 경로 내 디렉터리 이름 (예: "images", "resumes")
     * @return 업로드된 파일의 URL
     * @throws IOException 파일 처리 중 발생 예외
     */
    public String uploadFile(MultipartFile multipartFile, String dirName) throws IOException {
        log.info("파일 업로드 시작. 파일명: {}, 디렉토리: {}", multipartFile.getOriginalFilename(), dirName);
        String fileName = dirName + "/" + UUID.randomUUID() + "_" + multipartFile.getOriginalFilename();
        log.info("저장될 최종 파일명: {}", fileName);

        // 로컬 개발 모드 우회 처리
        if ("local".equals(activeProfile) || "mock_bucket_name".equals(s3Config.getBucketName())) {
            log.info("[로컬 모드] S3 업로드를 우회하여 로컬 파일 시스템에 저장합니다.");
            String uploadDir = System.getProperty("user.dir") + "/uploads/" + dirName;
            File dir = new File(uploadDir);
            if (!dir.exists()) {
                dir.mkdirs();
            }
            String simpleFileName = UUID.randomUUID() + "_" + multipartFile.getOriginalFilename();
            File dest = new File(dir, simpleFileName);
            multipartFile.transferTo(dest);
            String url = "http://localhost:8080/uploads/" + dirName + "/" + simpleFileName;
            log.info("[로컬 모드] 파일 저장 완료. 접근 URL: {}", url);
            return url;
        }

        try {
            PutObjectRequest putReq = PutObjectRequest.builder()
                    .bucket(s3Config.getBucketName())
                    .key(fileName)
                    .contentType(multipartFile.getContentType())
                    .build();

            log.info("S3 버킷명: {}", s3Config.getBucketName());
            log.info("파일 Content-Type: {}", multipartFile.getContentType());

            s3Client.putObject(
                    putReq,
                    RequestBody.fromInputStream(multipartFile.getInputStream(), multipartFile.getSize())
            );
            log.info("S3 파일 업로드 성공. 파일명: {}", fileName);

        } catch (IOException e) {
            log.error("S3 파일 업로드 중 IO 오류 발생: {}", e.getMessage(), e);
            throw new IOException("S3 파일 업로드에 실패했습니다.", e);
        } catch (Exception e) { // 기타 예외 처리 추가
            log.error("S3 파일 업로드 중 알 수 없는 오류 발생: {}", e.getMessage(), e);
            throw new IOException("S3 파일 업로드 중 알 수 없는 오류가 발생했습니다.", e);
        }

        String url = s3Client.utilities()
                .getUrl(b -> b.bucket(s3Config.getBucketName()).key(fileName))
                .toExternalForm();
        log.info("업로드된 파일 URL: {}", url);
        return url;
    }

    /**
     * S3 또는 로컬에서 이미지를 다운로드하여 base64로 변환합니다.
     * @param imageUrl 이미지 URL (전체 URL 또는 키)
     * @return base64 인코딩된 이미지 문자열 (data:image/... 형식)
     * @throws IOException 파일 다운로드 중 발생 예외
     */
    public String getImageAsBase64(String imageUrl) throws IOException {
        try {
            // 로컬 개발 모드 우회 처리
            if ("local".equals(activeProfile) || imageUrl.startsWith("http://localhost:8080/uploads/")) {
                log.info("[로컬 모드] 로컬 파일 시스템에서 이미지를 읽습니다. URL: {}", imageUrl);
                String key = imageUrl.substring(imageUrl.indexOf("/uploads/") + "/uploads/".length());
                String filePath = System.getProperty("user.dir") + "/uploads/" + key;
                File file = new File(filePath);
                if (!file.exists()) {
                    throw new IOException("로컬 파일을 찾을 수 없습니다: " + filePath);
                }
                byte[] imageBytes = Files.readAllBytes(file.toPath());
                String base64 = Base64.getEncoder().encodeToString(imageBytes);

                String contentType = "image/png"; // 기본값
                if (key.toLowerCase().endsWith(".jpg") || key.toLowerCase().endsWith(".jpeg")) {
                    contentType = "image/jpeg";
                } else if (key.toLowerCase().endsWith(".png")) {
                    contentType = "image/png";
                } else if (key.toLowerCase().endsWith(".gif")) {
                    contentType = "image/gif";
                } else if (key.toLowerCase().endsWith(".webp")) {
                    contentType = "image/webp";
                }

                String dataUrl = "data:" + contentType + ";base64," + base64;
                log.info("[로컬 모드] 로컬 이미지 base64 변환 성공. 크기: {} bytes", imageBytes.length);
                return dataUrl;
            }

            // URL에서 키 추출
            String key = extractKeyFromUrl(imageUrl);
            log.info("S3 이미지 다운로드 시작. 키: {}", key);

            GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                    .bucket(s3Config.getBucketName())
                    .key(key)
                    .build();

            try (ResponseInputStream<?> responseInputStream = s3Client.getObject(getObjectRequest)) {
                byte[] imageBytes = responseInputStream.readAllBytes();
                String base64 = Base64.getEncoder().encodeToString(imageBytes);
                
                // Content-Type 추정 (확장자 기반)
                String contentType = "image/png"; // 기본값
                if (key.toLowerCase().endsWith(".jpg") || key.toLowerCase().endsWith(".jpeg")) {
                    contentType = "image/jpeg";
                } else if (key.toLowerCase().endsWith(".png")) {
                    contentType = "image/png";
                } else if (key.toLowerCase().endsWith(".gif")) {
                    contentType = "image/gif";
                } else if (key.toLowerCase().endsWith(".webp")) {
                    contentType = "image/webp";
                }
                
                String dataUrl = "data:" + contentType + ";base64," + base64;
                log.info("S3 이미지 base64 변환 성공. 크기: {} bytes", imageBytes.length);
                return dataUrl;
            }
        } catch (Exception e) {
            log.error("이미지 다운로드 중 오류 발생: {}", e.getMessage(), e);
            throw new IOException("이미지 다운로드에 실패했습니다.", e);
        }
    }

    /**
     * S3 URL에서 키를 추출합니다.
     * @param url S3 URL 또는 키
     * @return S3 키
     */
    private String extractKeyFromUrl(String url) {
        // 이미 키 형식인 경우 (resume-images/xxx.png)
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            return url.startsWith("/") ? url.substring(1) : url;
        }
        
        // 전체 URL인 경우 키 추출
        // 예: https://hirepicker-storage.s3.ap-northeast-2.amazonaws.com/resume-images/xxx.png
        String bucketUrl = "https://" + s3Config.getBucketName() + ".s3.ap-northeast-2.amazonaws.com/";
        if (url.startsWith(bucketUrl)) {
            return url.substring(bucketUrl.length());
        }
        
        // 다른 형식의 URL인 경우
        int lastSlash = url.lastIndexOf('/');
        if (lastSlash >= 0) {
            return url.substring(lastSlash + 1);
        }
        
        return url;
    }
}

