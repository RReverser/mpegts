(function (exports) {

var H264 = {
	ExpGolomb: jBinary.Property(
		null,
		function () {
			var count = 0;
			while (!this.binary.read(1)) count++;
			return ((1 << count) | this.binary.read(count)) - 1;
		},
		function (value) {
			var length = (value + 1).toString(2).length;
			this.binary.write(length - 1, 0);
			this.binary.write(length, value);
		}
	),

	SPS: {
		forbidden_zero_bit: 1,
		nal_ref_idc: 2,
		nal_unit_type: 5,
		profile_idc: 'uint8',
		constraint_set_flags: 4,
		_reserved: 4,
		level_idc: 'uint8',
		seq_parameter_set_id: 'ExpGolomb',
		log2_max_frame_num_minus4: 'ExpGolomb',
		pic_order_cnt_type: 'ExpGolomb',
		log2_max_pic_order_cnt_lsb_minus4: 'ExpGolomb',
		num_ref_frames: 'ExpGolomb',
		gaps_in_frame_num_value_allowed_flag: 1,
		pic_width_in_mbs_minus_1: 'ExpGolomb',
		pic_height_in_map_units_minus_1: 'ExpGolomb',
		frame_mbs_only_flag: 1,
		direct_8x8_inference_flag: 1,
		frame_cropping_flag: 1,
		vui_parameters_present_flag: 1,
		rbsp_stop_one_bit: 1
	}
};

if (typeof module !== 'undefined' && exports === module.exports) {
	module.exports = H264;
} else {
	exports.H264 = H264;
}

})(this);