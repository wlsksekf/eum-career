package com.hirepicker.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.File;

/**
 * 로컬 디스크의 uploads/ 폴더를 정적 웹 리소스로 서빙하기 위한 설정 클래스.
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String uploadPath = System.getProperty("user.dir") + "/uploads/";
        
        // Windows의 백슬래시(\) 경로 형식을 file:/// 프로토콜 형식에 맞게 치환
        File file = new File(uploadPath);
        String absolutePath = file.getAbsolutePath();
        if (!absolutePath.endsWith(File.separator)) {
            absolutePath += File.separator;
        }

        registry.addResourceHandler("/uploads/**")
                .addResourceLocations("file:///" + absolutePath.replace("\\", "/"));
    }
}
