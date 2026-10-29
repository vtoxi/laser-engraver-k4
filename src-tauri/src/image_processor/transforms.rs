use image::{DynamicImage, GrayImage, GenericImageView, imageops};

/// Fit inside `max_w` × `max_h` preserving aspect ratio (contain). Kept for future “fit to bed” UI.
#[allow(dead_code)]
pub fn resize_fit(img: &DynamicImage, max_w: u32, max_h: u32) -> DynamicImage {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return img.clone();
    }
    let scale = (max_w as f64 / w as f64).min(max_h as f64 / h as f64);
    let nw = ((w as f64) * scale).round().max(1.0) as u32;
    let nh = ((h as f64) * scale).round().max(1.0) as u32;
    img.resize(nw, nh, imageops::FilterType::Lanczos3)
}

pub fn resize_exact(img: &DynamicImage, w: u32, h: u32) -> DynamicImage {
    img.resize_exact(w, h, imageops::FilterType::Lanczos3)
}

pub fn rotate(img: &DynamicImage, degrees: u32) -> DynamicImage {
    match degrees % 360 {
        90 => DynamicImage::ImageRgba8(imageops::rotate90(&img.to_rgba8())),
        180 => DynamicImage::ImageRgba8(imageops::rotate180(&img.to_rgba8())),
        270 => DynamicImage::ImageRgba8(imageops::rotate270(&img.to_rgba8())),
        _ => img.clone(),
    }
}

pub fn flip_h(img: &DynamicImage) -> DynamicImage {
    DynamicImage::ImageRgba8(imageops::flip_horizontal(&img.to_rgba8()))
}

pub fn flip_v(img: &DynamicImage) -> DynamicImage {
    DynamicImage::ImageRgba8(imageops::flip_vertical(&img.to_rgba8()))
}

/// Map UI contrast -100..100 to a factor for `colorops::contrast`.
pub fn ui_contrast_to_factor(ui: f32) -> f32 {
    (1.0 + (ui / 100.0) * 0.85).clamp(0.05, 3.0)
}

pub fn adjust(img: &DynamicImage, brightness: i32, contrast_ui: f32) -> DynamicImage {
    let mut out = DynamicImage::ImageRgba8(imageops::brighten(&img.to_rgba8(), brightness));
    let f = ui_contrast_to_factor(contrast_ui);
    out = DynamicImage::ImageRgba8(imageops::contrast(&out.to_rgba8(), f));
    out
}

pub fn invert(img: &DynamicImage) -> DynamicImage {
    let mut out = img.clone();
    out.invert();
    out
}

pub fn to_grayscale(img: &DynamicImage) -> GrayImage {
    img.to_luma8()
}

pub fn crop(img: &DynamicImage, x: u32, y: u32, w: u32, h: u32) -> DynamicImage {
    img.crop_imm(x, y, w, h)
}
