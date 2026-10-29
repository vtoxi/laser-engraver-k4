/// `mask[y][x] == true` = foreground (laser would burn here). Returns only the 4-connected
/// boundary of that region (interior holes keep an outer ring; single-pixel dots stay on).
pub fn foreground_outline(mask: &[Vec<bool>]) -> Vec<Vec<bool>> {
    let h = mask.len();
    if h == 0 {
        return vec![];
    }
    let w = mask[0].len();
    let mut out = vec![vec![false; w]; h];
    for y in 0..h {
        for x in 0..w {
            if !mask[y][x] {
                continue;
            }
            let is_edge = if x == 0 || y == 0 || x + 1 == w || y + 1 == h {
                true
            } else {
                !mask[y][x - 1] || !mask[y][x + 1] || !mask[y - 1][x] || !mask[y + 1][x]
            };
            if is_edge {
                out[y][x] = true;
            }
        }
    }
    out
}
