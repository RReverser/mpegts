(function (exports) {

var H264 = {
	ExpGolomb: jBinary.Property(
		['isSigned'],
		function () {
			var count = 0;
			while (!this.binary.read(1)) count++;
			var value = (1 << count) | this.binary.read(count);
			return this.isSigned ? (value & 1 ? -(value >> 1) : value >> 1) : value - 1;
		},
		function (value) {
			if (this.isSigned) {
				value <<= 1;
				if (value <= 0) {
					value = -value | 1;
				}
			} else {
				value++;
			}
			var length = value.toString(2).length;
			this.binary.write(length - 1, 0);
			this.binary.write(length, value);
		}
	),

	Optional: jBinary.Property(
	    ['baseType'],
		function () {
			if (this.binary.read(1)) return this.binary.read(this.baseType);
		},
		function (value) {
			this.binary.write(value != null ? 1 : 0);
			if (value != null) {
				this.binary.write(this.baseType, value);
			}
		}
	),

	ScalingList: jBinary.Template(
		function (size) {
			this.baseType = ['array', { /* TODO: implement scaling list */ }, size];
		}
	),

	SPS: [
		'extend',
		{
			forbidden_zero_bit: 1,
			nal_ref_idc: 2,
			nal_unit_type: 5,
			profile_idc: 'uint8',
			constraint_set_flags: ['array', 1, 8],
			level_idc: 'uint8',
			seq_parameter_set_id: 'ExpGolomb',
		},
		['if', function () { return [100, 110, 122, 244, 44, 83, 86, 118].indexOf(this.binary.getContext().profile_idc) >= 0 }, {
			chroma_format: ['enum', 'ExpGolomb', ['MONO', 'YUV420', 'YUV422', 'YUV444']],
			separate_color_plane_flag: ['if', function () { return this.binary.getContext().chroma_format === 'YUV444' }, 1],
			bit_depth_luma_minus8: 'ExpGolomb',
			bit_depth_chroma_minus8: 'ExpGolomb',
			qpprime_y_zero_transform_bypass_flag: 1,
			scaling_matrix: ['Optional', {
				scalingList4x4: ['array', ['ScalingList', 16], 6],
				scalingList8x8: ['array', ['ScalingList', 64], function () { return this.binary.getContext(1).chroma_format !== 'YUV444' ? 2 : 6 }]
			}]
		}],
		{
			log2_max_frame_num_minus4: 'ExpGolomb',
			pic_order_cnt_type: 'ExpGolomb',
			pic_order: ['if_not', 'pic_order_cnt_type', {log2_max_pic_order_cnt_lsb_minus4: 'ExpGolomb'}, [
				'if',
				function () { return this.binary.getContext().pic_order_cnt_type === 1 },
				{
					delta_pic_order_always_zero_flag: 1,
					offset_for_non_ref_pic: ['ExpGolomb', true],
					offset_for_top_to_bottom_field: ['ExpGolomb', true],
					_num_ref_frames_in_pic_order_cnt_cycle: jBinary.Property(
						null,
						function () { return this.binary.read('ExpGolomb') },
						function () { this.binary.write('ExpGolomb', this.binary.getContext().offset_for_ref_frame.length) }
					),
					offset_for_ref_frame: ['array', ['ExpGolomb', true], function () { return this.binary.getContext()._num_ref_frames_in_pic_order_cnt_cycle }]
				}
			]],
			max_num_ref_frames: 'ExpGolomb',
			gaps_in_frame_num_value_allowed_flag: 1,
			pic_width_in_mbs_minus_1: 'ExpGolomb',
			pic_height_in_map_units_minus_1: 'ExpGolomb',
			frame_mbs_only_flag: 1,
			mb_adaptive_frame_field_flag: ['if_not', 'frame_mbs_only_flag', 1],
			direct_8x8_inference_flag: 1,
			frame_cropping: ['Optional', {
				left: 'ExpGolomb',
				right: 'ExpGolomb',
				top: 'ExpGolomb',
				bottom: 'ExpGolomb'
			}]
			// TODO: add VUI parameters
		}
	]
};

if (typeof module !== 'undefined' && exports === module.exports) {
	module.exports = H264;
} else {
	exports.H264 = H264;
}

})(this);