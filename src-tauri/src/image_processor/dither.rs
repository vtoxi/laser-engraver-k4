use image::GrayImage;

/// Floyd–Steinberg: `true` = black = laser on.
pub fn floyd_steinberg(img: &GrayImage, threshold: u8) -> Vec<Vec<bool>> {
    let (w, h) = img.dimensions();
    let mut pixels: Vec<Vec<i32>> = (0..h)
        .map(|y| (0..w).map(|x| img.get_pixel(x, y)[0] as i32).collect())
        .collect();

    let mut result = vec![vec![false; w as usize]; h as usize];

    for y in 0..h as usize {
        for x in 0..w as usize {
            let old = pixels[y][x];
            let new_val = if old < threshold as i32 { 0 } else { 255 };
            result[y][x] = new_val == 0;
            let quant_error = old - new_val;

            if x + 1 < w as usize {
                pixels[y][x + 1] += quant_error * 7 / 16;
            }
            if y + 1 < h as usize {
                if x > 0 {
                    pixels[y + 1][x - 1] += quant_error * 3 / 16;
                }
                pixels[y + 1][x] += quant_error * 5 / 16;
                if x + 1 < w as usize {
                    pixels[y + 1][x + 1] += quant_error * 1 / 16;
                }
            }
        }
    }
    result
}

/// Atkinson dithering.
pub fn atkinson(img: &GrayImage, threshold: u8) -> Vec<Vec<bool>> {
    let (w, h) = img.dimensions();
    let mut pixels: Vec<Vec<i32>> = (0..h)
        .map(|y| (0..w).map(|x| img.get_pixel(x, y)[0] as i32).collect())
        .collect();

    let mut result = vec![vec![false; w as usize]; h as usize];
    let spread: &[(i32, i32)] = &[(0, 1), (0, 2), (1, -1), (1, 0), (1, 1), (2, 0)];

    for y in 0..h as usize {
        for x in 0..w as usize {
            let old = pixels[y][x].clamp(0, 255);
            let new_val = if old < threshold as i32 { 0 } else { 255 };
            result[y][x] = new_val == 0;
            let err = (old - new_val) / 8;

            for (dy, dx) in spread {
                let ny = y as i32 + dy;
                let nx = x as i32 + dx;
                if ny >= 0 && ny < h as i32 && nx >= 0 && nx < w as i32 {
                    pixels[ny as usize][nx as usize] += err;
                }
            }
        }
    }
    result
}

pub fn bayer4x4(img: &GrayImage) -> Vec<Vec<bool>> {
    const MATRIX: [[u8; 4]; 4] = [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5],
    ];
    let (w, h) = img.dimensions();
    let mut result = vec![vec![false; w as usize]; h as usize];
    for y in 0..h as usize {
        for x in 0..w as usize {
            let pixel = img.get_pixel(x as u32, y as u32)[0];
            let threshold = (MATRIX[y % 4][x % 4] as u32 * 16 + 8).min(255) as u8;
            result[y][x] = pixel < threshold;
        }
    }
    result
}

pub fn threshold(img: &GrayImage, thresh: u8) -> Vec<Vec<bool>> {
    let (w, h) = img.dimensions();
    let mut result = vec![vec![false; w as usize]; h as usize];
    for y in 0..h as usize {
        for x in 0..w as usize {
            result[y][x] = img.get_pixel(x as u32, y as u32)[0] < thresh;
        }
    }
    result
}
