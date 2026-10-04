import { IsString, Length, Matches } from 'class-validator';

export class TwoFactorLoginDto {
  @IsString()
  @Length(20, 1024)
  challengeToken!: string;

  @IsString()
  @Length(6, 8)
  @Matches(/^\d+$/, {
    message: 'El código debe contener solo dígitos.',
  })
  code!: string;
}
